package com.jvtech.gefinc.admin.user;

import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.audit.AuditEntry;
import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.admin.common.AdminPolicy;
import com.jvtech.gefinc.admin.common.AdminPolicy.Action;
import com.jvtech.gefinc.admin.common.AdminPolicy.Subject;
import com.jvtech.gefinc.admin.common.Reauthenticator;
import com.jvtech.gefinc.admin.email.EmailDelivery;
import com.jvtech.gefinc.admin.email.EmailDeliveryRepository;
import com.jvtech.gefinc.auth.PasswordResetService;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.error.TooManyRequestsException;
import com.jvtech.gefinc.common.mail.DeliveryMode;
import com.jvtech.gefinc.common.mail.MailKind;
import com.jvtech.gefinc.common.mail.MailOutcome;
import com.jvtech.gefinc.common.mail.MailService;
import com.jvtech.gefinc.common.mail.OutgoingMail;
import com.jvtech.gefinc.common.ratelimit.PerKeyRateLimiter;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import com.jvtech.gefinc.user.UserRole;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

/**
 * Reenviar o e-mail de redefinição de senha ({@code PASSWORD_RESET_SENT}) e forçar a redefinição
 * ({@code PASSWORD_RESET_FORCED}), além de reenviar a partir de uma falha do histórico de e-mails
 * (US4). O envio é síncrono de tentativa única ({@link DeliveryMode#SYNC_ONCE}): se o SMTP falhar,
 * responde {@code 502 MAIL_DELIVERY_FAILED}, desfaz toda a transação (nenhuma senha ou sessão muda
 * e o link anterior permanece válido) e registra {@code FAILED} na auditoria e no histórico de
 * envios. Limita a 3 envios bem-sucedidos por hora por usuário-alvo ({@code 429}). O administrador
 * nunca recebe nem vê senha, link ou token.
 */
@Service
public class AdminPasswordResetService {

  private final AdminActionExecutor executor;
  private final Reauthenticator reauthenticator;
  private final AdminPolicy policy;
  private final UserRepository users;
  private final PasswordResetService passwordReset;
  private final MailService mailService;
  private final EmailDeliveryRepository deliveries;
  private final PerKeyRateLimiter targetLimiter;

  public AdminPasswordResetService(
      AdminActionExecutor executor,
      Reauthenticator reauthenticator,
      AdminPolicy policy,
      UserRepository users,
      PasswordResetService passwordReset,
      MailService mailService,
      EmailDeliveryRepository deliveries,
      @Qualifier("adminTargetMailLimiter") PerKeyRateLimiter targetLimiter) {
    this.executor = executor;
    this.reauthenticator = reauthenticator;
    this.policy = policy;
    this.users = users;
    this.passwordReset = passwordReset;
    this.mailService = mailService;
    this.deliveries = deliveries;
    this.targetLimiter = targetLimiter;
  }

  /**
   * Reenvia o e-mail de redefinição com um novo link (invalida os anteriores). Permitido inclusive
   * para o administrador raiz, desde que a conta esteja ativa.
   */
  public void send(long targetId) {
    long actorId = CurrentUser.id();
    UserRole actorRole = UserRole.valueOf(CurrentUser.role());
    executor.run(
        new AuditContext(AuditAction.PASSWORD_RESET_SENT, targetId, null, null, null),
        () -> {
          User target = load(targetId);
          policy.enforce(
              Action.SEND_PASSWORD_RESET, new Subject(actorId, actorRole, true), subject(target));
          checkTargetRateLimit(target.getId());
          OutgoingMail mail = passwordReset.prepareResetMail(target);
          deliverOrRollback(mail, target.getId());
          return null;
        });
  }

  /**
   * Força a redefinição de senha: exige a senha do administrador (conferida antes de travar o
   * alvo), recusa o administrador raiz ({@code 403 ROOT_PROTECTED}), invalida a senha atual e todas
   * as sessões e envia um novo link.
   */
  public void force(long targetId, String password) {
    long actorId = CurrentUser.id();
    UserRole actorRole = UserRole.valueOf(CurrentUser.role());
    // Calculado fora da trava de linha para não segurar users durante o BCrypt (A32).
    String unmatchableHash = passwordReset.newUnmatchablePasswordHash();
    executor.run(
        new AuditContext(AuditAction.PASSWORD_RESET_FORCED, targetId, null, null, null),
        () -> {
          if (AuditEntry.hasNul(password)) {
            throw ApiException.validation("Há campos inválidos.")
                .withFieldError("password", "A senha contém caracteres inválidos.");
          }
          // A31a: reautentica antes de travar qualquer linha de users.
          reauthenticator.verify(password);
          User target = load(targetId);
          policy.enforce(
              Action.FORCE_PASSWORD_RESET, new Subject(actorId, actorRole, true), subject(target));
          checkTargetRateLimit(target.getId());
          OutgoingMail mail = passwordReset.forceReset(target, unmatchableHash);
          deliverOrRollback(mail, target.getId());
          return null;
        });
  }

  /**
   * Reenvia uma redefinição de senha a partir de um registro {@code FAILED} de {@code
   * email_deliveries}. Só aceita {@code PASSWORD_RESET} com falha e conta ainda existente e ativa.
   */
  public void resendFailedDelivery(long deliveryId) {
    long actorId = CurrentUser.id();
    UserRole actorRole = UserRole.valueOf(CurrentUser.role());
    AtomicReference<Long> resolvedTargetId = new AtomicReference<>();
    executor.runWithDynamicTarget(
        AuditAction.PASSWORD_RESET_SENT,
        resolvedTargetId,
        "delivery:" + deliveryId,
        () -> {
          EmailDelivery delivery =
              deliveries
                  .findById(deliveryId)
                  .orElseThrow(
                      () ->
                          new ApiException(
                              ErrorCode.NOT_FOUND, "Registro de envio não encontrado."));
          if (delivery.getKind() != MailKind.PASSWORD_RESET
              || !EmailDelivery.FAILED.equals(delivery.getStatus())
              || delivery.getUserId() == null) {
            throw new ApiException(
                ErrorCode.ACCOUNT_NOT_USABLE,
                "Somente envios de redefinição de senha com falha e conta ativa podem ser"
                    + " reenviados.");
          }
          User target =
              users
                  .findForUpdate(delivery.getUserId())
                  .orElseThrow(
                      () ->
                          new ApiException(
                              ErrorCode.ACCOUNT_NOT_USABLE,
                              "A conta deste envio já não existe ou não está disponível."));
          resolvedTargetId.set(target.getId());
          policy.enforce(
              Action.SEND_PASSWORD_RESET, new Subject(actorId, actorRole, true), subject(target));
          checkTargetRateLimit(target.getId());
          OutgoingMail mail = passwordReset.prepareResetMail(target);
          deliverOrRollback(mail, target.getId());
          return null;
        });
  }

  private void checkTargetRateLimit(long targetId) {
    String key = Long.toString(targetId);
    long wait = targetLimiter.secondsUntilFree(key);
    if (wait > 0) {
      throw new TooManyRequestsException(
          "Limite de 3 envios de redefinição por hora para este usuário atingido. Aguarde antes de"
              + " tentar novamente.",
          wait);
    }
  }

  private void deliverOrRollback(OutgoingMail mail, long targetId) {
    MailOutcome outcome = mailService.send(mail, DeliveryMode.SYNC_ONCE);
    if (!outcome.sent()) {
      throw new ApiException(
          ErrorCode.MAIL_DELIVERY_FAILED,
          "Não foi possível enviar o e-mail de redefinição. Nenhuma alteração foi aplicada.");
    }
    targetLimiter.record(Long.toString(targetId));
  }

  private User load(long targetId) {
    return users
        .findForUpdate(targetId)
        .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Usuário não encontrado."));
  }

  private static Subject subject(User user) {
    return new Subject(user.getId(), user.getRole(), user.isActive());
  }
}
