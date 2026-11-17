package com.jvtech.gefinc.admin.user;

import com.jvtech.gefinc.admin.audit.ActorKind;
import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.audit.AuditEntry;
import com.jvtech.gefinc.admin.audit.AuditService;
import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.PendingEmailChangeView;
import com.jvtech.gefinc.auth.RevokedBy;
import com.jvtech.gefinc.auth.TokenService;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.error.TooManyRequestsException;
import com.jvtech.gefinc.common.mail.DeliveryMode;
import com.jvtech.gefinc.common.mail.MailKind;
import com.jvtech.gefinc.common.mail.MailOutcome;
import com.jvtech.gefinc.common.mail.MailService;
import com.jvtech.gefinc.common.mail.MailTemplates;
import com.jvtech.gefinc.common.mail.OutgoingMail;
import com.jvtech.gefinc.common.ratelimit.PerKeyRateLimiter;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import com.jvtech.gefinc.user.UserRole;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Troca de e-mail administrativa com prova de posse (FR-014, FR-052; US9.6-US9.11; SC-018).
 *
 * <p>O código nunca é exposto em resposta, log, auditoria ou banco (onde guarda-se apenas o HMAC).
 * O e-mail antigo permanece válido até a confirmação bem-sucedida. Na confirmação, todas as sessões
 * e tokens de renovação são revogados e ambos os endereços são avisados.
 */
@Service
public class EmailChangeService {

  private static final Duration CODE_VALIDITY = Duration.ofMinutes(15);
  private static final String CODE_PLACEHOLDER_HASH = "0".repeat(64);
  private static final SecureRandom RANDOM = new SecureRandom();

  private final AdminActionExecutor executor;
  private final AuditService audit;
  private final UserRepository users;
  private final PendingEmailChangeRepository pendingChanges;
  private final EmailChangeAttemptRecorder attemptRecorder;
  private final TokenService tokens;
  private final MailService mailService;
  private final Pseudonymizer pseudonymizer;
  private final PerKeyRateLimiter targetLimiter;
  private final TransactionTemplate transaction;
  private final Clock clock;

  public EmailChangeService(
      AdminActionExecutor executor,
      AuditService audit,
      UserRepository users,
      PendingEmailChangeRepository pendingChanges,
      EmailChangeAttemptRecorder attemptRecorder,
      TokenService tokens,
      MailService mailService,
      Pseudonymizer pseudonymizer,
      @Qualifier("adminTargetMailLimiter") PerKeyRateLimiter targetLimiter,
      PlatformTransactionManager transactionManager,
      Clock clock) {
    this.executor = executor;
    this.audit = audit;
    this.users = users;
    this.pendingChanges = pendingChanges;
    this.attemptRecorder = attemptRecorder;
    this.tokens = tokens;
    this.mailService = mailService;
    this.pseudonymizer = pseudonymizer;
    this.targetLimiter = targetLimiter;
    this.transaction = new TransactionTemplate(transactionManager);
    this.clock = clock;
  }

  /**
   * Solicita a troca do e-mail de um usuário. Gera o código de 6 dígitos, envia para o novo
   * endereço via {@code SYNC_ONCE} e grava apenas o HMAC vinculado ao pedido.
   */
  public PendingEmailChangeView request(long userId, String rawNewEmail) {
    long adminId = CurrentUser.id();
    String normalizedEmail =
        rawNewEmail == null ? "" : rawNewEmail.strip().toLowerCase(Locale.ROOT);

    return executor.run(
        new AuditContext(AuditAction.EMAIL_CHANGE_REQUESTED, userId, null, null, null),
        () -> {
          User target = loadTarget(userId);
          assertNotRoot(target);

          if (normalizedEmail.isBlank()) {
            throw ApiException.validation("Há campos inválidos.")
                .withFieldError("newEmail", "Informe o novo endereço de e-mail.");
          }

          if (normalizedEmail.equalsIgnoreCase(target.getEmail())
              || users.existsByEmail(normalizedEmail)) {
            throw new ApiException(
                ErrorCode.EMAIL_ALREADY_REGISTERED, "Este e-mail já está cadastrado.");
          }

          if (pendingChanges.existsPendingForOtherUser(normalizedEmail, userId)) {
            throw new ApiException(
                ErrorCode.EMAIL_ALREADY_REGISTERED, "Este e-mail já está em uso.");
          }

          checkTargetRateLimit(userId);

          Instant now = clock.instant();
          Instant expiresAt = now.plus(CODE_VALIDITY);

          // Invalida pendência anterior do usuário, se houver
          pendingChanges
              .findPendingForUpdate(userId)
              .ifPresent(
                  existing -> {
                    existing.cancel(now);
                    pendingChanges.saveAndFlush(existing);
                  });

          String code = String.format("%06d", RANDOM.nextInt(1_000_000));
          String emailRef = pseudonymizer.emailRef(normalizedEmail);

          PendingEmailChange pending =
              new PendingEmailChange(
                  userId,
                  adminId,
                  normalizedEmail,
                  emailRef,
                  CODE_PLACEHOLDER_HASH,
                  now,
                  expiresAt);
          pending = pendingChanges.saveAndFlush(pending);

          String codeHash = pseudonymizer.codeHash(pending.getId(), code);
          pending.assignCodeHash(codeHash);
          pendingChanges.saveAndFlush(pending);

          String body =
              MailTemplates.render(
                  "email-change-code", Map.of("codigo", code, "validade", "15 minutos"));
          OutgoingMail mail =
              new OutgoingMail(
                  MailKind.EMAIL_CHANGE_CODE,
                  normalizedEmail,
                  "GEFINC: código de confirmação",
                  body,
                  userId);

          MailOutcome outcome = mailService.send(mail, DeliveryMode.SYNC_ONCE);
          if (!outcome.sent()) {
            throw new ApiException(
                ErrorCode.MAIL_DELIVERY_FAILED,
                "Não foi possível enviar o código de confirmação. Nenhuma alteração foi"
                    + " aplicada.");
          }

          targetLimiter.record(Long.toString(userId));
          return new PendingEmailChangeView(normalizedEmail, expiresAt, pending.getAttemptsLeft());
        });
  }

  /**
   * Confirma a troca de e-mail com o código de 6 dígitos.
   *
   * <p>Tentativas incorretas incrementam o contador em transação independente; na 5ª falha, a
   * pendência é invalidada. Erros respondem 422 {@code EMAIL_CHANGE_CODE_INVALID} auditados como
   * {@code EMAIL_CHANGE_FAILED}.
   */
  public void confirm(long userId, String rawCode) {
    long adminId = CurrentUser.id();
    String code = rawCode == null ? "" : rawCode.strip();

    User targetUser =
        users
            .findById(userId)
            .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Usuário não encontrado."));
    if (targetUser.getRole() == UserRole.ROOT) {
      audit.recordRefusal(
          AuditEntry.builder(AuditAction.EMAIL_CHANGE_CONFIRMED)
              .actor(ActorKind.ADMIN, adminId)
              .target(userId)
              .refusal(ErrorCode.ROOT_PROTECTED.name())
              .build());
      throw new ApiException(ErrorCode.ROOT_PROTECTED, "Administrador raiz protegido.");
    }

    Optional<PendingEmailChange> pendingOpt = pendingChanges.findPending(userId);
    if (pendingOpt.isEmpty()) {
      throw invalidCode(adminId, userId, "Código de confirmação inválido ou inexistente.");
    }

    PendingEmailChange pending = pendingOpt.get();
    Instant now = clock.instant();

    if (pending.isExpired(now)) {
      attemptRecorder.markExpired(pending.getId(), now);
      throw invalidCode(adminId, userId, "O código de confirmação expirou.");
    }

    if (code.length() != 6 || !code.matches("^\\d{6}$")) {
      attemptRecorder.recordFailure(pending.getId(), now);
      throw invalidCode(adminId, userId, "Código de confirmação inválido.");
    }

    String expectedHash = pseudonymizer.codeHash(pending.getId(), code);
    boolean matches =
        MessageDigest.isEqual(
            expectedHash.getBytes(StandardCharsets.UTF_8),
            pending.getCodeHash().getBytes(StandardCharsets.UTF_8));

    if (!matches) {
      attemptRecorder.recordFailure(pending.getId(), now);
      throw invalidCode(adminId, userId, "Código de confirmação incorreto.");
    }

    // Sucesso na verificação do código: aplica a troca na transação com travas de escrita
    transaction.execute(
        status -> {
          User target = loadTarget(userId);
          assertNotRoot(target);

          PendingEmailChange lockedPending =
              pendingChanges
                  .findPendingForUpdate(userId)
                  .orElseThrow(
                      () ->
                          invalidCode(
                              adminId, userId, "Código de confirmação inválido ou inexistente."));

          String newEmail = lockedPending.getNewEmail();
          if (users.existsByEmail(newEmail)) {
            throw new ApiException(
                ErrorCode.EMAIL_ALREADY_REGISTERED, "Este e-mail já está cadastrado.");
          }

          String oldEmail = target.getEmail();
          target.changeEmail(newEmail);
          tokens.revokeAllOfUser(userId, RevokedBy.ADMIN);

          lockedPending.confirm(now);
          pendingChanges.saveAndFlush(lockedPending);

          // Avisos para ambos os endereços com reenvio automático
          OutgoingMail oldNotice =
              new OutgoingMail(
                  MailKind.EMAIL_CHANGE_NOTICE,
                  oldEmail,
                  "GEFINC: seu e-mail de acesso foi alterado",
                  MailTemplates.render("email-change-notice-old", Map.of()),
                  userId);
          mailService.send(oldNotice, DeliveryMode.WITH_RETRY);

          OutgoingMail newNotice =
              new OutgoingMail(
                  MailKind.EMAIL_CHANGE_NOTICE,
                  newEmail,
                  "GEFINC: seu e-mail de acesso foi alterado",
                  MailTemplates.render("email-change-notice-new", Map.of()),
                  userId);
          mailService.send(newNotice, DeliveryMode.WITH_RETRY);

          audit.record(
              AuditEntry.builder(AuditAction.EMAIL_CHANGE_CONFIRMED)
                  .actor(ActorKind.ADMIN, adminId)
                  .target(userId)
                  .build());

          return null;
        });
  }

  /** Cancela explicitamente a troca pendente do usuário. */
  public void cancel(long userId) {
    executor.run(
        new AuditContext(AuditAction.EMAIL_CHANGE_CANCELED, userId, null, null, null),
        () -> {
          User target = loadTarget(userId);
          assertNotRoot(target);

          Instant now = clock.instant();
          pendingChanges
              .findPendingForUpdate(userId)
              .ifPresent(
                  pending -> {
                    pending.cancel(now);
                    pendingChanges.saveAndFlush(pending);
                  });
          return null;
        });
  }

  private User loadTarget(long userId) {
    return users
        .findForUpdate(userId)
        .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Usuário não encontrado."));
  }

  private static void assertNotRoot(User target) {
    if (target.getRole() == UserRole.ROOT) {
      throw new ApiException(ErrorCode.ROOT_PROTECTED, "Administrador raiz protegido.");
    }
  }

  private void checkTargetRateLimit(long targetId) {
    String key = Long.toString(targetId);
    long wait = targetLimiter.secondsUntilFree(key);
    if (wait > 0) {
      throw new TooManyRequestsException(
          "Limite de 3 envios de troca de e-mail por hora para este usuário atingido. Aguarde antes"
              + " de tentar novamente.",
          wait);
    }
  }

  private ApiException invalidCode(long adminId, long targetUserId, String message) {
    audit.recordRefusal(
        AuditEntry.builder(AuditAction.EMAIL_CHANGE_FAILED)
            .actor(ActorKind.ADMIN, adminId)
            .target(targetUserId)
            .refusal(ErrorCode.EMAIL_CHANGE_CODE_INVALID.name())
            .build());
    return new ApiException(ErrorCode.EMAIL_CHANGE_CODE_INVALID, message);
  }
}
