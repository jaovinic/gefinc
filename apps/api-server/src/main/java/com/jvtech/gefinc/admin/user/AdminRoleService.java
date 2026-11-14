package com.jvtech.gefinc.admin.user;

import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.audit.AuditDetails;
import com.jvtech.gefinc.admin.audit.AuditKey;
import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.admin.common.AdminPolicy;
import com.jvtech.gefinc.admin.common.AdminPolicy.Action;
import com.jvtech.gefinc.admin.common.AdminPolicy.Subject;
import com.jvtech.gefinc.admin.common.Reauthenticator;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import com.jvtech.gefinc.user.UserRole;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Service;

/**
 * Concede e retira o perfil de administrador. Toda tentativa é auditada ({@code ROLE_GRANTED} ou
 * {@code ROLE_REVOKED}), inclusive as recusadas, e a mudança e a linha da trilha andam na mesma
 * transação. A senha do administrador é conferida antes de qualquer leitura do alvo; o alvo é lido
 * com bloqueio de escrita. Idempotente: repetir o pedido não muda nada e responde sucesso, com
 * {@code from == to} na trilha. O papel só vale na requisição seguinte porque é lido do banco a
 * cada requisição.
 */
@Service
public class AdminRoleService {

  private final AdminActionExecutor executor;
  private final Reauthenticator reauthenticator;
  private final AdminPolicy policy;
  private final UserRepository users;

  public AdminRoleService(
      AdminActionExecutor executor,
      Reauthenticator reauthenticator,
      AdminPolicy policy,
      UserRepository users) {
    this.executor = executor;
    this.reauthenticator = reauthenticator;
    this.policy = policy;
    this.users = users;
  }

  /** {@code requested}: {@code ADMIN} concede, {@code USER} retira. */
  public void change(long targetId, UserRole requested, String password) {
    if (requested == UserRole.ROOT) {
      throw new IllegalArgumentException("O raiz não se concede pelo painel.");
    }
    boolean grant = requested == UserRole.ADMIN;
    Action action = grant ? Action.GRANT_ADMIN : Action.REVOKE_ADMIN;
    AuditAction auditAction = grant ? AuditAction.ROLE_GRANTED : AuditAction.ROLE_REVOKED;
    long actorId = CurrentUser.id();
    UserRole actorRole = UserRole.valueOf(CurrentUser.role());
    AtomicReference<UserRole> before = new AtomicReference<>();
    AtomicReference<UserRole> after = new AtomicReference<>();

    executor.run(
        new AuditContext(
            auditAction,
            targetId,
            null,
            null,
            () ->
                AuditDetails.of()
                    .put(AuditKey.FROM, before.get().name())
                    .put(AuditKey.TO, after.get().name())),
        () -> {
          reauthenticator.verify(password);
          User target =
              users
                  .findForUpdate(targetId)
                  .orElseThrow(
                      () -> new ApiException(ErrorCode.NOT_FOUND, "Usuário não encontrado."));
          before.set(target.getRole());
          policy.enforce(action, new Subject(actorId, actorRole, true), subject(target));
          if (grant) {
            target.grantAdmin();
          } else {
            target.revokeAdmin();
          }
          after.set(target.getRole());
          return null;
        });
  }

  private static Subject subject(User user) {
    return new Subject(user.getId(), user.getRole(), user.isActive());
  }
}
