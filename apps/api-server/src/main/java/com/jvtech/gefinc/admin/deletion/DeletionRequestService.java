package com.jvtech.gefinc.admin.deletion;

import com.jvtech.gefinc.admin.audit.ActorKind;
import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.admin.common.AdminPolicy;
import com.jvtech.gefinc.admin.common.AdminPolicy.Action;
import com.jvtech.gefinc.admin.common.AdminPolicy.Subject;
import com.jvtech.gefinc.admin.common.Reauthenticator;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.DeletionOutcome;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.DeletionRequest;
import com.jvtech.gefinc.auth.RevokedBy;
import com.jvtech.gefinc.auth.TokenService;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.mail.DeliveryMode;
import com.jvtech.gefinc.common.mail.MailKind;
import com.jvtech.gefinc.common.mail.MailOutcome;
import com.jvtech.gefinc.common.mail.MailService;
import com.jvtech.gefinc.common.mail.MailTemplates;
import com.jvtech.gefinc.common.mail.OutgoingMail;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import com.jvtech.gefinc.user.UserRole;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Solicitação e cancelamento de exclusão de usuário pelo administrador (US10). Aplica
 * reautenticação prévia, trava de linha do alvo, salvaguardas de raiz e último administrador,
 * máquina de estados do livro-razão e resiliência de e-mail (a exclusão sempre prossegue).
 */
@Service
public class DeletionRequestService {

  public static final int JUSTIFICATION_MAX = 1000;
  private static final DateTimeFormatter DATE_FORMATTER =
      DateTimeFormatter.ofPattern("dd/MM/yyyy").withZone(ZoneId.of("America/Sao_Paulo"));

  private final UserRepository users;
  private final DeletionReasonRepository reasons;
  private final AccountDeletionRequestRepository deletionRepo;
  private final PendingCommunicationRepository pendingRepo;
  private final AccountErasureService erasureService;
  private final Reauthenticator reauthenticator;
  private final AdminPolicy adminPolicy;
  private final AdminActionExecutor executor;
  private final MailService mailService;
  private final TokenService tokenService;
  private final Pseudonymizer pseudonymizer;
  private final JdbcTemplate jdbc;
  private final Clock clock;

  public DeletionRequestService(
      UserRepository users,
      DeletionReasonRepository reasons,
      AccountDeletionRequestRepository deletionRepo,
      PendingCommunicationRepository pendingRepo,
      AccountErasureService erasureService,
      Reauthenticator reauthenticator,
      AdminPolicy adminPolicy,
      AdminActionExecutor executor,
      MailService mailService,
      TokenService tokenService,
      Pseudonymizer pseudonymizer,
      JdbcTemplate jdbc,
      Clock clock) {
    this.users = users;
    this.reasons = reasons;
    this.deletionRepo = deletionRepo;
    this.pendingRepo = pendingRepo;
    this.erasureService = erasureService;
    this.reauthenticator = reauthenticator;
    this.adminPolicy = adminPolicy;
    this.executor = executor;
    this.mailService = mailService;
    this.tokenService = tokenService;
    this.pseudonymizer = pseudonymizer;
    this.jdbc = jdbc;
    this.clock = clock;
  }

  public DeletionOutcome requestDeletion(long targetUserId, DeletionRequest request) {
    // 1. Reautenticação da senha do administrador é executada ANTES de travar a linha do alvo
    // (ordem global)
    reauthenticator.verify(request.password());

    // 2. Validações preliminares dos dados de entrada
    String justification = validateJustification(request.justification());
    String mode = validateMode(request.mode());
    Integer days = validateDays(mode, request.days());

    long actorId = CurrentUser.id();
    UserRole actorRole = UserRole.valueOf(CurrentUser.role());

    // 3. Execução dentro da transação e auditoria administrativa
    return executor.run(
        new AuditContext(AuditAction.DELETION_REQUESTED, targetUserId, null, justification, null),
        () -> {
          // Carrega e trava a linha do alvo
          User target =
              users
                  .findForUpdate(targetUserId)
                  .orElseThrow(
                      () -> new ApiException(ErrorCode.NOT_FOUND, "Usuário não encontrado."));

          // Confirmação do e-mail digitado
          if (request.confirmEmail() == null
              || !request.confirmEmail().trim().equalsIgnoreCase(target.getEmail())) {
            throw new ApiException(
                ErrorCode.INVALID_CONFIRMATION,
                "O e-mail de confirmação digitado não corresponde ao e-mail do usuário.");
          }

          // Validação do motivo
          if (request.reasonId() == null) {
            throw ApiException.validation("Há campos inválidos.")
                .withFieldError("reasonId", "Informe o motivo da exclusão.");
          }
          DeletionReason reason =
              reasons
                  .findById(request.reasonId())
                  .orElseThrow(
                      () ->
                          ApiException.validation("Há campos inválidos.")
                              .withFieldError("reasonId", "Motivo de exclusão não encontrado."));
          if (!reason.isActive()) {
            throw ApiException.validation("Há campos inválidos.")
                .withFieldError("reasonId", "O motivo informado está desativado.");
          }

          // Salvaguardas: raiz, si mesmo, último administrador ativo
          adminPolicy.enforce(
              Action.DELETE_USER,
              new Subject(actorId, actorRole, true),
              new Subject(target.getId(), target.getRole(), target.isActive()));

          Instant now = clock.instant();
          Instant dueAt =
              AccountDeletionRequest.MODE_IMMEDIATE.equals(mode)
                  ? now
                  : now.plus(Duration.ofDays(days));

          boolean isAnticipation = false;
          Long supersedesId = null;

          if (target.isDeletionPending()) {
            if (target.isDeletionByAdmin()) {
              throw new ApiException(
                  ErrorCode.CONFLICT,
                  "Esta conta já possui uma exclusão administrativa em andamento.");
            }
            // Antecipação de agendamento de autoatendimento do usuário
            AccountDeletionRequest activeUserReq =
                deletionRepo
                    .findActiveByUserId(targetUserId)
                    .orElseThrow(
                        () ->
                            new ApiException(
                                ErrorCode.CONFLICT,
                                "Solicitação de exclusão do usuário não encontrada."));

            activeUserReq.requireEarlierThan(dueAt);
            activeUserReq.supersede();
            deletionRepo.saveAndFlush(activeUserReq);

            isAnticipation = true;
            supersedesId = activeUserReq.getId();
          }

          // Cria a solicitação no livro-razão
          AccountDeletionRequest deletionReq =
              AccountDeletionRequest.forAdmin(
                  target.getId(),
                  pseudonymizer.userRef(target.getId()),
                  mode,
                  days,
                  now,
                  dueAt,
                  actorId,
                  reason.getId(),
                  reason.getName(),
                  reason.getMessage(),
                  supersedesId);
          deletionReq = deletionRepo.save(deletionReq);

          // Dispara aviso por e-mail (a exclusão SEMPRE prossegue, mesmo com falha total)
          String noticeState = sendNotice(target, deletionReq, reason, mode, dueAt, now);
          deletionReq.updateNoticeState(noticeState);
          deletionRepo.save(deletionReq);

          if (AccountDeletionRequest.MODE_IMMEDIATE.equals(mode)) {
            // Exclusão imediata: executa a remoção e anonimização ANTES de responder
            erasureService.erase(target, deletionReq, ActorKind.ADMIN, actorId, justification);
            return new DeletionOutcome(AccountDeletionRequest.STATUS_EXECUTED, null, noticeState);
          } else {
            // Exclusão com carência: agenda no usuário e invalida todas as sessões
            target.scheduleAdminDeletion(now, dueAt, deletionReq.getId());
            users.save(target);
            tokenService.revokeAllOfUser(target.getId(), RevokedBy.ADMIN);
            return new DeletionOutcome(AccountDeletionRequest.STATUS_SCHEDULED, dueAt, noticeState);
          }
        });
  }

  public void cancelDeletion(long targetUserId) {
    long actorId = CurrentUser.id();

    executor.run(
        new AuditContext(AuditAction.DELETION_CANCELED, targetUserId, null, null, null),
        () -> {
          User target = users.findForUpdate(targetUserId).orElse(null);
          Instant now = clock.instant();

          if (target == null) {
            // Se o usuário já não existe, verifica se a exclusão já foi executada
            List<AccountDeletionRequest> requests =
                deletionRepo.findByUserIdOrderByRequestedAtDesc(targetUserId);
            if (requests.stream().anyMatch(AccountDeletionRequest::isExecuted)) {
              throw new ApiException(
                  ErrorCode.DELETION_ALREADY_EXECUTED,
                  "A exclusão desta conta já foi executada definitivamente.");
            }
            throw new ApiException(ErrorCode.NOT_FOUND, "Usuário não encontrado.");
          }

          if (!target.isDeletionPending()) {
            List<AccountDeletionRequest> requests =
                deletionRepo.findByUserIdOrderByRequestedAtDesc(targetUserId);
            if (requests.stream().anyMatch(AccountDeletionRequest::isExecuted)) {
              throw new ApiException(
                  ErrorCode.DELETION_ALREADY_EXECUTED,
                  "A exclusão desta conta já foi executada definitivamente.");
            }
            throw new ApiException(
                ErrorCode.NO_PENDING_DELETION, "Não há exclusão pendente nesta conta.");
          }

          AccountDeletionRequest activeReq =
              deletionRepo
                  .findActiveByUserId(targetUserId)
                  .orElseThrow(
                      () ->
                          new ApiException(
                              ErrorCode.NO_PENDING_DELETION,
                              "Não há solicitação de exclusão ativa no livro-razão."));

          // Cancela a solicitação ativa
          activeReq.cancel(now, actorId);
          deletionRepo.saveAndFlush(activeReq);

          if (activeReq.getSupersedesId() != null) {
            // Reversão de antecipação: a solicitação original do usuário volta a SCHEDULED
            AccountDeletionRequest previous =
                deletionRepo
                    .findById(activeReq.getSupersedesId())
                    .orElseThrow(
                        () ->
                            new IllegalStateException(
                                "Solicitação substituída original não encontrada."));

            previous.restoreFromSuperseded();
            deletionRepo.save(previous);

            // Restaura agendamento original do usuário
            target.restoreScheduledDeletion(
                previous.getRequestedAt(),
                previous.getDueAt(),
                previous.getOrigin(),
                previous.getId());
            users.save(target);

            // Envia e-mail informando que a solicitação dele continua para a data original
            sendCancellationNotice(target, activeReq, previous, true, now);
          } else {
            // Cancelamento de exclusão que não era antecipação:
            // Restaura estado anterior exato: suspensa continua suspensa, ativa continua ativa
            target.cancelDeletion();
            users.save(target);

            sendCancellationNotice(target, activeReq, null, false, now);
          }

          // Registra aviso no app (user_notices)
          jdbc.update(
              "INSERT INTO user_notices (user_id, kind, deletion_request_id, created_at)"
                  + " VALUES (?, 'DELETION_CANCELED', ?, ?)",
              target.getId(),
              activeReq.getId(),
              Timestamp.from(now));

          return null;
        });
  }

  private String sendNotice(
      User target,
      AccountDeletionRequest req,
      DeletionReason reason,
      String mode,
      Instant dueAt,
      Instant now) {
    OutgoingMail mail;
    if (AccountDeletionRequest.MODE_IMMEDIATE.equals(mode)) {
      String body =
          MailTemplates.render(
              "deletion-notice-immediate", Map.of("mensagem", reason.getMessage()));
      mail =
          new OutgoingMail(
              MailKind.DELETION_NOTICE,
              target.getEmail(),
              "GEFINC: exclusão de conta",
              body,
              target.getId());
    } else {
      String dateStr = DATE_FORMATTER.format(dueAt);
      String body =
          MailTemplates.render(
              "deletion-notice-grace", Map.of("data", dateStr, "mensagem", reason.getMessage()));
      mail =
          new OutgoingMail(
              MailKind.DELETION_NOTICE,
              target.getEmail(),
              "GEFINC: exclusão de conta",
              body,
              target.getId());
    }

    MailOutcome outcome = mailService.send(mail, DeliveryMode.SYNC_ONCE);
    if (outcome.sent()) {
      return AccountDeletionRequest.NOTICE_SENT;
    } else {
      String failure = outcome.reason() != null ? outcome.reason().name() : "OTHER";
      PendingCommunication comm =
          new PendingCommunication(
              PendingCommunication.KIND_DELETION_NOTICE,
              req.getId(),
              target.getId(),
              pseudonymizer.userRef(target.getId()),
              failure,
              outcome.attempts() == 0 ? 1 : outcome.attempts(),
              now);
      pendingRepo.save(comm);
      return AccountDeletionRequest.NOTICE_PENDING;
    }
  }

  private void sendCancellationNotice(
      User target,
      AccountDeletionRequest canceledReq,
      AccountDeletionRequest previousUserReq,
      boolean userRequestContinues,
      Instant now) {
    OutgoingMail mail;
    if (userRequestContinues && previousUserReq != null) {
      String dateStr = DATE_FORMATTER.format(previousUserReq.getDueAt());
      String detalhe = "A sua solicitação de exclusão continua agendada para " + dateStr + ".";
      String body = MailTemplates.render("deletion-canceled-continues", Map.of("detalhe", detalhe));
      mail =
          new OutgoingMail(
              MailKind.CANCELLATION_NOTICE,
              target.getEmail(),
              "GEFINC: exclusão de conta cancelada",
              body,
              target.getId());
    } else {
      String body = MailTemplates.render("deletion-canceled-active", Map.of());
      mail =
          new OutgoingMail(
              MailKind.CANCELLATION_NOTICE,
              target.getEmail(),
              "GEFINC: exclusão de conta cancelada",
              body,
              target.getId());
    }

    MailOutcome outcome = mailService.send(mail, DeliveryMode.SYNC_ONCE);
    if (!outcome.sent()) {
      String failure = outcome.reason() != null ? outcome.reason().name() : "OTHER";
      PendingCommunication comm =
          new PendingCommunication(
              PendingCommunication.KIND_CANCELLATION_NOTICE,
              canceledReq.getId(),
              target.getId(),
              pseudonymizer.userRef(target.getId()),
              failure,
              outcome.attempts() == 0 ? 1 : outcome.attempts(),
              now);
      pendingRepo.save(comm);
    }
  }

  private String validateJustification(String justification) {
    if (justification == null || justification.isBlank()) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("justification", "Informe a justificativa da exclusão.");
    }
    String stripped = justification.strip();
    if (stripped.length() > JUSTIFICATION_MAX) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError(
              "justification",
              "A justificativa deve ter no máximo " + JUSTIFICATION_MAX + " caracteres.");
    }
    return stripped;
  }

  private String validateMode(String mode) {
    if (mode == null
        || (!AccountDeletionRequest.MODE_IMMEDIATE.equalsIgnoreCase(mode)
            && !AccountDeletionRequest.MODE_GRACE.equalsIgnoreCase(mode))) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("mode", "Modo de exclusão inválido (deve ser IMMEDIATE ou GRACE).");
    }
    return mode.toUpperCase(java.util.Locale.ROOT);
  }

  private Integer validateDays(String mode, Integer days) {
    if (AccountDeletionRequest.MODE_GRACE.equals(mode)) {
      if (days == null || days < 1 || days > 30) {
        throw ApiException.validation("Há campos inválidos.")
            .withFieldError("days", "O prazo de carência deve ser entre 1 e 30 dias.");
      }
      return days;
    }
    return null;
  }
}
