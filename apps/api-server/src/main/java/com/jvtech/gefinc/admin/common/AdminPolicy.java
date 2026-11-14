package com.jvtech.gefinc.admin.common;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.user.UserRepository;
import com.jvtech.gefinc.user.UserRole;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Quem pode mudar o perfil de quem. {@link #decide} é a função pura das regras; {@link #enforce} a
 * aplica com efeito: nas ações que reduzem o conjunto de administradores ativos, serializa pela
 * trava consultiva {@value #LOCK_NAME} (vale até o fim da transação) e refaz a contagem sob a
 * trava, para duas retiradas simultâneas não deixarem o sistema sem administrador (R14). A ordem
 * das checagens é fixa: raiz, si mesmo, alvo ativo (só para conceder) e último administrador.
 */
@Component
public class AdminPolicy {

  /** Nome da trava consultiva do conjunto de administradores; todo caminho que o reduz a usa. */
  public static final String LOCK_NAME = "gefinc.admin-set";

  public enum Action {
    GRANT_ADMIN,
    REVOKE_ADMIN
  }

  /** Pessoa envolvida na decisão; {@code active}: sem suspensão e sem exclusão pendente. */
  public record Subject(long id, UserRole role, boolean active) {}

  private final JdbcTemplate jdbc;
  private final UserRepository users;

  public AdminPolicy(JdbcTemplate jdbc, UserRepository users) {
    this.jdbc = jdbc;
    this.users = users;
  }

  /**
   * Decisão pura. {@code otherActiveAdmins}: administradores ativos (administrador comum ou raiz)
   * sem contar o alvo. Devolve o código da recusa, ou vazio se a ação é permitida (inclusive quando
   * não muda nada, que é idempotente).
   */
  public static Optional<ErrorCode> decide(
      Action action, Subject actor, Subject target, int otherActiveAdmins) {
    if (target.role() == UserRole.ROOT) {
      return Optional.of(ErrorCode.ROOT_PROTECTED);
    }
    if (actor.id() == target.id()) {
      return Optional.of(ErrorCode.SELF_ACTION_FORBIDDEN);
    }
    boolean grant = action == Action.GRANT_ADMIN;
    if (grant && target.role() == UserRole.USER && !target.active()) {
      return Optional.of(ErrorCode.ACCOUNT_NOT_USABLE);
    }
    if (changesAdminSet(action, target) && otherActiveAdmins < 1) {
      return Optional.of(ErrorCode.LAST_ADMIN);
    }
    return Optional.empty();
  }

  /** A ação reduz o conjunto de administradores ativos (só retirar o perfil de um ativo). */
  public static boolean changesAdminSet(Action action, Subject target) {
    return action == Action.REVOKE_ADMIN && target.role() == UserRole.ADMIN && target.active();
  }

  /** Aplica a política; lança {@link ApiException} com o código da recusa. */
  @Transactional(propagation = Propagation.MANDATORY)
  public void enforce(Action action, Subject actor, Subject target) {
    // Recusas que não dependem de contagem saem antes, sem tomar a trava.
    decide(action, actor, target, Integer.MAX_VALUE).ifPresent(AdminPolicy::refuse);
    if (changesAdminSet(action, target)) {
      lockAdminSet();
      long others = users.countActiveAdminsExcluding(target.id());
      decide(action, actor, target, (int) Math.min(others, Integer.MAX_VALUE))
          .ifPresent(AdminPolicy::refuse);
    }
  }

  /**
   * Garante que, sem {@code excludedUserId}, ainda reste um administrador ativo (autoexclusão da
   * conta de um administrador). Toma a mesma trava e refaz a contagem sob ela.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public void requireAnotherActiveAdmin(long excludedUserId) {
    lockAdminSet();
    if (users.countActiveAdminsExcluding(excludedUserId) < 1) {
      refuse(ErrorCode.LAST_ADMIN);
    }
  }

  /** Trava de transação: espera quem a detém e é solta no commit ou rollback. */
  @Transactional(propagation = Propagation.MANDATORY)
  public void lockAdminSet() {
    jdbc.query(
        "SELECT pg_advisory_xact_lock(hashtext(?))", ps -> ps.setString(1, LOCK_NAME), rs -> {});
  }

  private static void refuse(ErrorCode code) {
    throw new ApiException(code, message(code));
  }

  private static String message(ErrorCode code) {
    return switch (code) {
      case ROOT_PROTECTED -> "O administrador raiz não pode ser alterado pelo painel.";
      case SELF_ACTION_FORBIDDEN -> "Não é possível alterar o próprio perfil de administrador.";
      case ACCOUNT_NOT_USABLE -> "A conta precisa estar ativa para receber o perfil.";
      case LAST_ADMIN -> "O sistema precisa manter ao menos um administrador ativo.";
      default -> "Operação não permitida.";
    };
  }
}
