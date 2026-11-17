package com.jvtech.gefinc.admin.deletion;

import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.PendingCommunicationView;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.ResendResult;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.mail.DeliveryMode;
import com.jvtech.gefinc.common.mail.MailKind;
import com.jvtech.gefinc.common.mail.MailOutcome;
import com.jvtech.gefinc.common.mail.MailService;
import com.jvtech.gefinc.common.mail.MailTemplates;
import com.jvtech.gefinc.common.mail.OutgoingMail;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gestão de comunicações pendentes e reenvio/descarte de avisos ao usuário (US10, FR-056, FR-057).
 * O endereço de e-mail nunca é exposto na listagem (SC-012).
 */
@Service
public class PendingCommunicationService {

  private static final DateTimeFormatter DATE_FORMATTER =
      DateTimeFormatter.ofPattern("dd/MM/yyyy").withZone(ZoneId.of("America/Sao_Paulo"));

  private final PendingCommunicationRepository pendingRepo;
  private final AccountDeletionRequestRepository deletionRepo;
  private final UserRepository users;
  private final MailService mailService;
  private final Pseudonymizer pseudonymizer;
  private final AdminActionExecutor executor;
  private final Clock clock;

  public PendingCommunicationService(
      PendingCommunicationRepository pendingRepo,
      AccountDeletionRequestRepository deletionRepo,
      UserRepository users,
      MailService mailService,
      Pseudonymizer pseudonymizer,
      AdminActionExecutor executor,
      Clock clock) {
    this.pendingRepo = pendingRepo;
    this.deletionRepo = deletionRepo;
    this.users = users;
    this.mailService = mailService;
    this.pseudonymizer = pseudonymizer;
    this.executor = executor;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public List<PendingCommunicationView> listPending() {
    return pendingRepo
        .findAllByStateOrderByCreatedAtDesc(PendingCommunication.STATE_PENDING)
        .stream()
        .map(this::toView)
        .toList();
  }

  @Transactional(readOnly = true)
  public long countPending() {
    return pendingRepo.countByState(PendingCommunication.STATE_PENDING);
  }

  public ResendResult resend(long id) {
    return executor.run(
        new AuditContext(AuditAction.COMMUNICATION_RESENT, null, Long.toString(id), null, null),
        () -> {
          PendingCommunication comm = load(id);
          if (!comm.isPending()) {
            throw new ApiException(
                ErrorCode.CONFLICT, "Esta comunicação já não está mais pendente.");
          }

          AccountDeletionRequest req =
              deletionRepo
                  .findById(comm.getDeletionRequestId())
                  .orElseThrow(
                      () ->
                          new ApiException(
                              ErrorCode.NOT_FOUND, "Solicitação de exclusão não encontrada."));

          String recipient = resolveRecipient(comm);
          OutgoingMail mail = buildMail(comm, req, recipient);

          MailOutcome outcome = mailService.send(mail, DeliveryMode.SYNC_ONCE);
          Instant now = clock.instant();

          if (outcome.sent()) {
            comm.markDelivered(now);
            req.updateNoticeState(AccountDeletionRequest.NOTICE_SENT);
            pendingRepo.save(comm);
            deletionRepo.save(req);
            return new ResendResult("DELIVERED");
          } else {
            String failure = outcome.reason() != null ? outcome.reason().name() : "OTHER";
            comm.recordFailedAttempt(failure);
            pendingRepo.save(comm);
            return new ResendResult("PENDING");
          }
        });
  }

  public void discard(long id) {
    executor.run(
        new AuditContext(AuditAction.COMMUNICATION_DISCARDED, null, Long.toString(id), null, null),
        () -> {
          PendingCommunication comm = load(id);
          if (!comm.isPending()) {
            return null;
          }
          Instant now = clock.instant();
          comm.discard(now);
          pendingRepo.save(comm);

          deletionRepo
              .findById(comm.getDeletionRequestId())
              .ifPresent(
                  req -> {
                    req.updateNoticeState(AccountDeletionRequest.NOTICE_DISCARDED);
                    deletionRepo.save(req);
                  });
          return null;
        });
  }

  private String resolveRecipient(PendingCommunication comm) {
    User user = users.findById(comm.getUserId()).orElse(null);
    if (user != null) {
      return user.getEmail();
    }
    if (comm.getRetainedEmail() != null && !comm.getRetainedEmail().isBlank()) {
      return comm.getRetainedEmail();
    }
    throw new ApiException(ErrorCode.CONFLICT, "Endereço de e-mail não disponível para reenvio.");
  }

  private OutgoingMail buildMail(
      PendingCommunication comm, AccountDeletionRequest req, String recipient) {
    if (PendingCommunication.KIND_DELETION_NOTICE.equals(comm.getKind())) {
      if (AccountDeletionRequest.MODE_IMMEDIATE.equals(req.getMode())) {
        String body =
            MailTemplates.render(
                "deletion-notice-immediate", Map.of("mensagem", req.getReasonMessage()));
        return new OutgoingMail(
            MailKind.DELETION_NOTICE,
            recipient,
            "GEFINC: exclusão de conta",
            body,
            comm.getUserId());
      } else {
        String dateStr = DATE_FORMATTER.format(req.getDueAt());
        String body =
            MailTemplates.render(
                "deletion-notice-grace",
                Map.of("data", dateStr, "mensagem", req.getReasonMessage()));
        return new OutgoingMail(
            MailKind.DELETION_NOTICE,
            recipient,
            "GEFINC: exclusão de conta",
            body,
            comm.getUserId());
      }
    } else {
      if (req.getSupersedesId() != null) {
        String dateStr = DATE_FORMATTER.format(req.getDueAt());
        String detalhe = "A sua solicitação de exclusão continua agendada para " + dateStr + ".";
        String body =
            MailTemplates.render("deletion-canceled-continues", Map.of("detalhe", detalhe));
        return new OutgoingMail(
            MailKind.CANCELLATION_NOTICE,
            recipient,
            "GEFINC: exclusão de conta cancelada",
            body,
            comm.getUserId());
      } else {
        String body = MailTemplates.render("deletion-canceled-active", Map.of());
        return new OutgoingMail(
            MailKind.CANCELLATION_NOTICE,
            recipient,
            "GEFINC: exclusão de conta cancelada",
            body,
            comm.getUserId());
      }
    }
  }

  private PendingCommunicationView toView(PendingCommunication comm) {
    String label;
    User user = users.findById(comm.getUserId()).orElse(null);
    if (user != null) {
      label = user.getEmail();
    } else {
      label = pseudonymizer.anonymousLabel(comm.getUserId());
    }
    return new PendingCommunicationView(
        comm.getId(),
        comm.getKind(),
        label,
        comm.getFailureReason(),
        comm.getAttempts(),
        comm.getCreatedAt(),
        comm.getRetainedUntil());
  }

  private PendingCommunication load(long id) {
    return pendingRepo
        .findById(id)
        .orElseThrow(
            () -> new ApiException(ErrorCode.NOT_FOUND, "Comunicação pendente não encontrada."));
  }
}
