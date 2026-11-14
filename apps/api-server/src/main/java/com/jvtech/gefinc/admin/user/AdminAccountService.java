package com.jvtech.gefinc.admin.user;

import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.admin.common.AdminPolicy;
import com.jvtech.gefinc.admin.common.AdminPolicy.Action;
import com.jvtech.gefinc.admin.common.AdminPolicy.Subject;
import com.jvtech.gefinc.auth.LoginAttemptLimiter;
import com.jvtech.gefinc.auth.RevokedBy;
import com.jvtech.gefinc.auth.TokenService;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import com.jvtech.gefinc.user.UserRole;
import java.time.Clock;
import org.springframework.stereotype.Service;

/**
 * Suspender, reativar e retirar o bloqueio de login (US3). Toda ação é auditada na mesma transação
 * (inclusive as recusadas), o alvo é lido com bloqueio de escrita antes da trava consultiva dos
 * administradores e o ator vem de {@link CurrentUser}. Suspender é independente da exclusão da
 * conta: as duas podem coexistir e reativar mantém a exclusão pendente. A suspensão derruba na
 * requisição seguinte todas as sessões (linhas de {@code auth_sessions}, tokens de renovação e a
 * versão do token) e o motivo (1 a 500 caracteres) vai só para a auditoria; nenhum aviso sai para o
 * usuário.
 */
@Service
public class AdminAccountService {

  static final int REASON_MAX = 500;

  private final AdminActionExecutor executor;
  private final AdminPolicy policy;
  private final UserRepository users;
  private final TokenService tokens;
  private final LoginAttemptLimiter loginLimiter;
  private final Clock clock;

  public AdminAccountService(
      AdminActionExecutor executor,
      AdminPolicy policy,
      UserRepository users,
      TokenService tokens,
      LoginAttemptLimiter loginLimiter,
      Clock clock) {
    this.executor = executor;
    this.policy = policy;
    this.users = users;
    this.tokens = tokens;
    this.loginLimiter = loginLimiter;
    this.clock = clock;
  }

  public void suspend(long targetId, String reason) {
    long actorId = CurrentUser.id();
    UserRole actorRole = UserRole.valueOf(CurrentUser.role());
    String text = reason == null ? "" : reason.strip();
    // Motivo inválido não vai para a trilha: a recusa guarda só o código.
    String auditedReason = !text.isEmpty() && text.length() <= REASON_MAX ? text : null;
    executor.run(
        new AuditContext(AuditAction.USER_SUSPENDED, targetId, null, auditedReason, null),
        () -> {
          if (auditedReason == null) {
            throw ApiException.validation("Há campos inválidos.")
                .withFieldError(
                    "reason",
                    "Informe o motivo da suspensão (de 1 a " + REASON_MAX + " caracteres).");
          }
          User target = load(targetId);
          policy.enforce(Action.SUSPEND, new Subject(actorId, actorRole, true), subject(target));
          tokens.revokeAllOfUser(targetId, RevokedBy.ADMIN);
          target.suspend(clock.instant());
          return null;
        });
  }

  /** Idempotente: reativar conta que não está suspensa responde sucesso sem mudar nada. */
  public void reactivate(long targetId) {
    long actorId = CurrentUser.id();
    UserRole actorRole = UserRole.valueOf(CurrentUser.role());
    executor.run(
        new AuditContext(AuditAction.USER_REACTIVATED, targetId, null, null, null),
        () -> {
          User target = load(targetId);
          policy.enforce(Action.REACTIVATE, new Subject(actorId, actorRole, true), subject(target));
          target.reactivate();
          return null;
        });
  }

  /**
   * Retira o bloqueio temporário por tentativas de login: zera só a contagem do e-mail do alvo (não
   * a do IP). Idempotente.
   */
  public void clearLoginLock(long targetId) {
    long actorId = CurrentUser.id();
    UserRole actorRole = UserRole.valueOf(CurrentUser.role());
    executor.run(
        new AuditContext(AuditAction.LOGIN_LOCK_CLEARED, targetId, null, null, null),
        () -> {
          User target = load(targetId);
          policy.enforce(
              Action.CLEAR_LOGIN_LOCK, new Subject(actorId, actorRole, true), subject(target));
          loginLimiter.clearLock(target.getEmail());
          return null;
        });
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
