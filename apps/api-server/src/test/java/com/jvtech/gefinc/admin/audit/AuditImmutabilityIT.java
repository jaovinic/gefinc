package com.jvtech.gefinc.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jvtech.gefinc.support.IntegrationTestBase;
import java.sql.SQLException;
import org.junit.jupiter.api.Test;

/**
 * A trilha de auditoria é imutável no próprio banco: UPDATE, DELETE e TRUNCATE falham com {@code
 * restrict_violation} (23001) até para o dono; só INSERT funciona. O dado pessoal separado some com
 * o usuário sem tocar a trilha.
 */
class AuditImmutabilityIT extends IntegrationTestBase {

  private static final String INSERT =
      "INSERT INTO audit_log (action, result, actor_kind) VALUES ('ACCESS_DENIED', 'REFUSED',"
          + " 'VISITOR')";

  private long insertAudit() {
    return jdbc.queryForObject(INSERT + " RETURNING id", Long.class);
  }

  private static void assertSqlState(Runnable statement, String sqlState) {
    assertThatThrownBy(statement::run)
        .rootCause()
        .isInstanceOfSatisfying(
            SQLException.class, e -> assertThat(e.getSQLState()).isEqualTo(sqlState));
  }

  @Test
  void insereComPadroesEMantemALinha() {
    long id = insertAudit();

    assertThat(
            jdbc.queryForObject(
                "SELECT details::text FROM audit_log WHERE id = ?", String.class, id))
        .isEqualTo("{}");
    assertThat(
            jdbc.queryForObject(
                "SELECT occurred_at IS NOT NULL FROM audit_log WHERE id = ?", Boolean.class, id))
        .isTrue();
  }

  @Test
  void updateDeleteETruncateFalhamComRestrictViolation() {
    long id = insertAudit();

    assertSqlState(
        () -> jdbc.update("UPDATE audit_log SET subject = 'x' WHERE id = ?", id), "23001");
    assertSqlState(() -> jdbc.update("DELETE FROM audit_log WHERE id = ?", id), "23001");
    assertSqlState(() -> jdbc.execute("TRUNCATE TABLE audit_log, audit_log_client"), "23001");
    assertSqlState(() -> jdbc.execute("TRUNCATE TABLE audit_log CASCADE"), "23001");

    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT subject FROM audit_log WHERE id = ?", String.class, id))
        .isNull();
  }

  @Test
  void acaoResultadoEAtorForaDoCatalogoSaoRecusados() {
    assertSqlState(
        () ->
            jdbc.update(
                "INSERT INTO audit_log (action, result, actor_kind) VALUES ('OUTRA', 'SUCCESS',"
                    + " 'ADMIN')"),
        "23514");
    assertSqlState(
        () ->
            jdbc.update(
                "INSERT INTO audit_log (action, result, actor_kind) VALUES ('ACCESS_DENIED',"
                    + " 'TALVEZ', 'ADMIN')"),
        "23514");
    assertSqlState(
        () ->
            jdbc.update(
                "INSERT INTO audit_log (action, result, actor_kind) VALUES ('ACCESS_DENIED',"
                    + " 'SUCCESS', 'ROBO')"),
        "23514");
  }

  @Test
  void excluirOUsuarioApagaODadoPessoalMasPreservaATrilha() {
    long user = seed.createUser("alvo@example.com").id();
    long identified = insertAudit();
    long visitor = insertAudit();
    jdbc.update(
        "INSERT INTO audit_log_client (audit_id, user_id, ip, device_label) VALUES (?, ?,"
            + " '203.0.113.7', 'Chrome em Windows')",
        identified,
        user);
    jdbc.update(
        "INSERT INTO audit_log_client (audit_id, user_id, ip) VALUES (?, NULL, '198.51.100.9')",
        visitor);

    jdbc.update("DELETE FROM users WHERE id = ?", user);

    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Integer.class)).isEqualTo(2);
    assertThat(jdbc.queryForList("SELECT audit_id FROM audit_log_client", Long.class))
        .containsExactly(visitor);
  }

  @Test
  void indicesExistem() {
    for (String index :
        new String[] {
          "ix_al_time",
          "ix_al_target",
          "ix_al_actor",
          "ix_al_action",
          "ix_al_dedupe",
          "ix_alc_visitor"
        }) {
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM pg_indexes WHERE indexname = ?", Integer.class, index))
          .as(index)
          .isEqualTo(1);
    }
  }
}
