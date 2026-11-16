package com.jvtech.gefinc.admin.common;

import com.jvtech.gefinc.common.security.CurrentUser;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Revoga só a sessão atual do administrador (a do {@code sid} do token da requisição): marca a
 * linha de {@code auth_sessions} como encerrada pelo sistema e revoga a família de tokens de
 * renovação, sem mexer nas outras sessões dele. Token anterior à sessão (sem {@code sid}) não tem
 * como ser isolado: cai no recurso antigo, que incrementa a versão do token e revoga todas as
 * famílias. Transação própria e só JDBC (sem carregar a entidade do usuário, para o Hibernate não
 * sobrescrever a versão incrementada): quem chama roda dentro da transação da ação, que sofre
 * rollback na recusa.
 *
 * <p>Ordem global de travas: {@code users} (só sem {@code sid}), {@code refresh_tokens} e, por
 * último, {@code auth_sessions}, a mesma da renovação, do logout e da ação administrativa sobre
 * sessões. A transação própria só é segura porque quem chama ({@link Reauthenticator}) ainda não
 * segura a linha do administrador: travá-la antes, na transação externa, faria o {@code UPDATE
 * users} daqui esperar uma trava que só some quando esta transação termina, sem que o PostgreSQL
 * detecte (são duas conexões do mesmo fluxo).
 */
@Component
public class SidSessionRevoker implements CurrentSessionRevoker {

  private static final String SYSTEM = "SYSTEM";

  private final JdbcTemplate jdbc;
  private final Clock clock;

  public SidSessionRevoker(JdbcTemplate jdbc, Clock clock) {
    this.jdbc = jdbc;
    this.clock = clock;
  }

  @Override
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void revokeCurrent(long adminId) {
    Timestamp now = Timestamp.from(clock.instant());
    UUID sessionId = CurrentUser.sessionId();
    if (sessionId != null) {
      jdbc.update(
          "UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL",
          now,
          sessionId);
      jdbc.update(
          "UPDATE auth_sessions SET revoked_at = ?, revoked_by = ?"
              + " WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
          now,
          SYSTEM,
          sessionId,
          adminId);
      return;
    }
    jdbc.update("UPDATE users SET token_version = token_version + 1 WHERE id = ?", adminId);
    jdbc.update(
        "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
        now,
        adminId);
    jdbc.update(
        "UPDATE auth_sessions SET revoked_at = ?, revoked_by = ?"
            + " WHERE user_id = ? AND revoked_at IS NULL",
        now,
        SYSTEM,
        adminId);
  }
}
