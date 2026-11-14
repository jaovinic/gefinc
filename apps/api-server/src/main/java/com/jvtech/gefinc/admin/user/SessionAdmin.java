package com.jvtech.gefinc.admin.user;

import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.audit.AuditDetails;
import com.jvtech.gefinc.admin.audit.AuditKey;
import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.admin.common.AdminPolicy;
import com.jvtech.gefinc.admin.common.AdminPolicy.Action;
import com.jvtech.gefinc.admin.common.AdminPolicy.Subject;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminSession;
import com.jvtech.gefinc.auth.AuthSession;
import com.jvtech.gefinc.auth.AuthSessionRepository;
import com.jvtech.gefinc.auth.RevokedBy;
import com.jvtech.gefinc.auth.TokenService;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import com.jvtech.gefinc.user.UserRole;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sessões de um usuário no painel: listar, encerrar uma e encerrar todas. O encerramento vale na
 * requisição seguinte (a claim {@code sid} e a linha de {@code auth_sessions} são conferidas a cada
 * requisição), derruba também os tokens de renovação da família e não avisa o usuário. O alvo é
 * lido com bloqueio de escrita antes de qualquer outra trava. Recusas: raiz ({@code
 * ROOT_PROTECTED}) e, para o próprio administrador, a sessão atual e "todas" ({@code
 * SELF_ACTION_FORBIDDEN}); as outras sessões dele podem ser encerradas. Encerrar todas incrementa a
 * versão do token, o que cobre também as sessões anteriores ao registro (sem linha nem {@code
 * sid}).
 */
@Service
public class SessionAdmin {

  private final AdminActionExecutor executor;
  private final AdminPolicy policy;
  private final UserRepository users;
  private final AuthSessionRepository sessions;
  private final TokenService tokens;
  private final Clock clock;

  public SessionAdmin(
      AdminActionExecutor executor,
      AdminPolicy policy,
      UserRepository users,
      AuthSessionRepository sessions,
      TokenService tokens,
      Clock clock) {
    this.executor = executor;
    this.policy = policy;
    this.users = users;
    this.sessions = sessions;
    this.tokens = tokens;
    this.clock = clock;
  }

  /** Sessões abertas, da mais recente para a mais antiga. Leitura: não é auditada. */
  @Transactional(readOnly = true)
  public List<AdminSession> list(long targetId) {
    if (!users.existsById(targetId)) {
      throw notFoundUser();
    }
    UUID mine = CurrentUser.sessionId();
    return sessions.findOpenOfUser(targetId, clock.instant()).stream()
        .map(session -> toDto(session, mine))
        .toList();
  }

  public void revokeOne(long targetId, String sessionIdText) {
    UUID sessionId = parse(sessionIdText);
    long actorId = CurrentUser.id();
    UserRole actorRole = UserRole.valueOf(CurrentUser.role());
    boolean isCurrent = sessionId != null && sessionId.equals(CurrentUser.sessionId());
    executor.run(
        new AuditContext(
            AuditAction.SESSION_REVOKED,
            targetId,
            sessionId == null ? null : sessionId.toString(),
            null,
            AuditDetails::of),
        () -> {
          User target = users.findForUpdate(targetId).orElseThrow(SessionAdmin::notFoundUser);
          // O raiz e a sessão atual do próprio administrador vêm antes de saber se a sessão existe.
          policy.enforce(
              actorId == targetId && isCurrent
                  ? Action.REVOKE_SESSIONS
                  : Action.REVOKE_OTHER_SESSION,
              new Subject(actorId, actorRole, true),
              subject(target));
          if (sessionId == null || sessions.findByIdAndUserId(sessionId, targetId).isEmpty()) {
            throw new ApiException(ErrorCode.NOT_FOUND, "Sessão não encontrada.");
          }
          tokens.revokeFamily(sessionId, RevokedBy.ADMIN);
          return null;
        });
  }

  public void revokeAll(long targetId) {
    long actorId = CurrentUser.id();
    UserRole actorRole = UserRole.valueOf(CurrentUser.role());
    AtomicInteger count = new AtomicInteger();
    executor.run(
        new AuditContext(
            AuditAction.SESSIONS_REVOKED_ALL,
            targetId,
            null,
            null,
            () -> AuditDetails.of().put(AuditKey.COUNT, count.get())),
        () -> {
          User target = users.findForUpdate(targetId).orElseThrow(SessionAdmin::notFoundUser);
          policy.enforce(
              Action.REVOKE_SESSIONS, new Subject(actorId, actorRole, true), subject(target));
          count.set(sessions.findOpenOfUser(targetId, clock.instant()).size());
          tokens.revokeAllOfUser(targetId, RevokedBy.ADMIN);
          // Cobre também os tokens de acesso sem sid, de antes das sessões.
          target.revokeAccessTokens();
          return null;
        });
  }

  private static AdminSession toDto(AuthSession session, UUID mine) {
    return new AdminSession(
        session.getId(),
        session.getCreatedAt(),
        session.getLastUsedAt(),
        session.getClientIp(),
        session.getDeviceLabel(),
        session.getId().equals(mine));
  }

  private static UUID parse(String text) {
    try {
      return UUID.fromString(text);
    } catch (IllegalArgumentException e) {
      return null;
    }
  }

  private static Subject subject(User user) {
    return new Subject(user.getId(), user.getRole(), user.isActive());
  }

  private static ApiException notFoundUser() {
    return new ApiException(ErrorCode.NOT_FOUND, "Usuário não encontrado.");
  }
}
