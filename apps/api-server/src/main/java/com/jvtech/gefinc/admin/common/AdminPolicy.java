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
 * Quem pode agir sobre quem (perfil, suspensão, sessões e bloqueio de login). {@link #decide} é a
 * função pura das regras; {@link #enforce} a aplica com efeito: nas ações que reduzem o conjunto de
 * administradores ativos, serializa pela trava consultiva {@value #LOCK_NAME} (vale até o fim da
 * transação) e refaz a contagem sob a trava, para duas retiradas simultâneas não deixarem o sistema
 * sem administrador (R14). A ordem das checagens é fixa: raiz, si mesmo, alvo ativo (só para
 * conceder) e último administrador. Quem chama toma antes a trava de linha do alvo ({@code
 * findForUpdate}): linha primeiro, trava consultiva depois, em todos os caminhos.
 *
 * <p><b>Ordem global de travas</b> (toda transação que escreve em mais de uma destas tabelas segue
 * esta ordem, senão duas requisições se esperam e o PostgreSQL derruba uma com {@code 40P01}):
 *
 * <ol>
 *   <li>{@code users} (linha do usuário, por {@code findForUpdate}, ou {@code UPDATE});
 *   <li>trava consultiva {@value #LOCK_NAME};
 *   <li>{@code refresh_tokens};
 *   <li>{@code auth_sessions};
 *   <li>{@code password_reset_tokens} e {@code account_deletion_requests}.
 * </ol>
 *
 * Quem começa por um token (renovação, redefinição de senha) descobre o dono sem travar e trava o
 * usuário antes de travar o token; cancelar a exclusão trava o usuário antes do livro-razão. O
 * login lê o usuário sem trava, mas só escreve depois (o {@code UPDATE} de último acesso já é o
 * primeiro passo da ordem), e o logout só toca {@code refresh_tokens} e {@code auth_sessions}, na
 * mesma ordem relativa.
 */
@Component
public class AdminPolicy {

  /** Nome da trava consultiva do conjunto de administradores; todo caminho que o reduz a usa. */
  public static final String LOCK_NAME = "gefinc.admin-set";

  public enum Action {
    GRANT_ADMIN,
    REVOKE_ADMIN,
    SUSPEND,
    REACTIVATE,
    REVOKE_SESSIONS,
    REVOKE_OTHER_SESSION,
    CLEAR_LOGIN_LOCK,
    SEND_PASSWORD_RESET,
    FORCE_PASSWORD_RESET,
    DELETE_USER,
    CANCEL_DELETION
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
    if (target.role() == UserRole.ROOT && action != Action.SEND_PASSWORD_RESET) {
      return Optional.of(ErrorCode.ROOT_PROTECTED);
    }
    if (actor.id() == target.id() && refusesSelf(action)) {
      return Optional.of(ErrorCode.SELF_ACTION_FORBIDDEN);
    }
    boolean grant = action == Action.GRANT_ADMIN;
    if (grant && target.role() == UserRole.USER && !target.active()) {
      return Optional.of(ErrorCode.ACCOUNT_NOT_USABLE);
    }
    if ((action == Action.SEND_PASSWORD_RESET || action == Action.FORCE_PASSWORD_RESET)
        && !target.active()) {
      return Optional.of(ErrorCode.ACCOUNT_NOT_USABLE);
    }
    if (changesAdminSet(action, target) && otherActiveAdmins < 1) {
      return Optional.of(ErrorCode.LAST_ADMIN);
    }
    return Optional.empty();
  }

  /**
   * O administrador não pode aplicar a si mesmo a troca de perfil, a suspensão nem o encerramento
   * da sessão atual ou de todas as suas sessões; reativar, retirar o bloqueio de login, encerrar
   * uma outra sessão sua e reenviar/forçar redefinição não são barrados por esta regra.
   */
  private static boolean refusesSelf(Action action) {
    return switch (action) {
      case GRANT_ADMIN, REVOKE_ADMIN, SUSPEND, REVOKE_SESSIONS, DELETE_USER -> true;
      case REACTIVATE,
          REVOKE_OTHER_SESSION,
          CLEAR_LOGIN_LOCK,
          SEND_PASSWORD_RESET,
          FORCE_PASSWORD_RESET,
          CANCEL_DELETION ->
          false;
    };
  }

  /**
   * A ação reduz o conjunto de administradores ativos (retirar o perfil, suspender ou excluir um
   * administrador ativo).
   */
  public static boolean changesAdminSet(Action action, Subject target) {
    return (action == Action.REVOKE_ADMIN
            || action == Action.SUSPEND
            || action == Action.DELETE_USER)
        && target.role() == UserRole.ADMIN
        && target.active();
  }

  /** Aplica a política; lança {@link ApiException} com o código da recusa. */
  @Transactional(propagation = Propagation.MANDATORY)
  public void enforce(Action action, Subject actor, Subject target) {
    // Recusas que não dependem de contagem saem antes, sem tomar a trava.
    decide(action, actor, target, Integer.MAX_VALUE).ifPresent(code -> refuse(action, code));
    if (changesAdminSet(action, target)) {
      lockAdminSet();
      long others = users.countActiveAdminsExcluding(target.id());
      decide(action, actor, target, (int) Math.min(others, Integer.MAX_VALUE))
          .ifPresent(code -> refuse(action, code));
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
      refuse(Action.REVOKE_ADMIN, ErrorCode.LAST_ADMIN);
    }
  }

  /** Trava de transação: espera quem a detém e é solta no commit ou rollback. */
  @Transactional(propagation = Propagation.MANDATORY)
  public void lockAdminSet() {
    jdbc.query(
        "SELECT pg_advisory_xact_lock(hashtext(?))", ps -> ps.setString(1, LOCK_NAME), rs -> {});
  }

  private static void refuse(Action action, ErrorCode code) {
    throw new ApiException(code, message(action, code));
  }

  private static String message(Action action, ErrorCode code) {
    return switch (code) {
      case ROOT_PROTECTED -> "O administrador raiz não pode ser alterado pelo painel.";
      case SELF_ACTION_FORBIDDEN -> "Esta ação não pode ser aplicada à própria conta.";
      case ACCOUNT_NOT_USABLE ->
          action == Action.GRANT_ADMIN
              ? "A conta precisa estar ativa para receber o perfil."
              : "A conta está suspensa ou aguardando exclusão e não pode receber esta ação.";
      case LAST_ADMIN -> "O sistema precisa manter ao menos um administrador ativo.";
      default -> "Operação não permitida.";
    };
  }
}
