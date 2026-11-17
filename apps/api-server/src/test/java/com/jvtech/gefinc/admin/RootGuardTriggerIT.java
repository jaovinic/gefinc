package com.jvtech.gefinc.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Segunda camada de proteção do administrador raiz, no banco: criar, rebaixar, promover ou apagar o
 * raiz só com a variável de transação {@code gefinc.allow_root_change} (roteiro do dono), e o raiz
 * nunca fica suspenso nem em exclusão (US1.4, US1.9, SC-008).
 */
class RootGuardTriggerIT extends IntegrationTestBase {

  private static final String PRIVILEGE = "42501";
  private static final String CHECK = "23514";

  @Autowired private PlatformTransactionManager transactionManager;
  @Autowired private UserRepository users;

  private static String sqlState(Throwable failure) {
    Throwable cause = failure;
    while (cause != null) {
      if (cause instanceof SQLException sql) {
        return sql.getSQLState();
      }
      cause = cause.getCause();
    }
    return null;
  }

  private void assertRejected(String sql, String expectedState, Object... args) {
    assertThatThrownBy(() -> jdbc.update(sql, args))
        .isInstanceOf(DataAccessException.class)
        .satisfies(e -> assertThat(sqlState(e)).isEqualTo(expectedState));
  }

  private void withRootScript(Runnable body) {
    new TransactionTemplate(transactionManager)
        .executeWithoutResult(
            status -> {
              jdbc.execute("SET LOCAL gefinc.allow_root_change = 'on'");
              body.run();
            });
  }

  @Test
  void semAVariavelCriarPromoverRebaixarOuApagarORaizFalhaComSqlState42501() {
    SeededUser common = seed.createUser("comum@example.com");
    SeededUser root = seed.createRoot("raiz@example.com");

    assertRejected(
        "INSERT INTO users (email, password_hash, role, created_at) VALUES ('r2@example.com', 'x',"
            + " 'ROOT', now())",
        PRIVILEGE);
    assertRejected("UPDATE users SET role = 'ROOT' WHERE id = ?", PRIVILEGE, common.id());
    assertRejected("UPDATE users SET role = 'USER' WHERE id = ?", PRIVILEGE, root.id());
    assertRejected("UPDATE users SET role = 'ADMIN' WHERE id = ?", PRIVILEGE, root.id());
    assertRejected("DELETE FROM users WHERE id = ?", PRIVILEGE, root.id());

    assertThat(jdbc.queryForObject("SELECT role FROM users WHERE id = ?", String.class, root.id()))
        .isEqualTo("ROOT");
    assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Long.class)).isEqualTo(2);
  }

  @Test
  void roteiroLiteralComSetLocalCriaAlteraEApagaORaiz() {
    SeededUser common = seed.createUser("comum@example.com");

    withRootScript(
        () ->
            jdbc.update(
                "INSERT INTO users (email, password_hash, role, created_at) VALUES"
                    + " ('raiz@example.com', 'x', 'ROOT', now())"));
    assertThat(
            jdbc.queryForObject(
                "SELECT role FROM users WHERE email = 'raiz@example.com'", String.class))
        .isEqualTo("ROOT");

    withRootScript(() -> jdbc.update("UPDATE users SET role = 'ROOT' WHERE id = ?", common.id()));
    assertThat(
            jdbc.queryForObject("SELECT role FROM users WHERE id = ?", String.class, common.id()))
        .isEqualTo("ROOT");

    withRootScript(() -> jdbc.update("UPDATE users SET role = 'USER' WHERE id = ?", common.id()));
    withRootScript(() -> jdbc.update("DELETE FROM users WHERE email = 'raiz@example.com'"));
    assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Long.class)).isEqualTo(1);
  }

  @Test
  void aVariavelDuraSoUmaTransacaoEORaizVoltaAFicarProtegido() {
    SeededUser root = seed.createRoot("raiz@example.com");

    withRootScript(() -> jdbc.update("UPDATE users SET role = 'ADMIN' WHERE id = ?", root.id()));
    assertRejected("UPDATE users SET role = 'ROOT' WHERE id = ?", PRIVILEGE, root.id());
  }

  @Test
  void raizSuspensoOuEmExclusaoEhRecusadoPelaRestricao() {
    SeededUser root = seed.createRoot("raiz@example.com");

    assertRejected("UPDATE users SET suspended_at = now() WHERE id = ?", CHECK, root.id());
    assertRejected(
        "UPDATE users SET deletion_requested_at = now(), deletion_due_at = now(),"
            + " deletion_origin = 'ADMIN', deletion_request_id = 1 WHERE id = ?",
        CHECK,
        root.id());
  }

  @Test
  void trocarNomeOuVersaoDoTokenDoRaizSemAVariavelPassaMesmoComOPapelMapeado() {
    SeededUser root = seed.createRoot("raiz@example.com");

    new TransactionTemplate(transactionManager)
        .executeWithoutResult(
            status -> {
              User entity = users.findById(root.id()).orElseThrow();
              entity.rename("Dona do Sistema");
              entity.changePassword("novo-hash");
            });

    assertThat(
            jdbc.queryForMap("SELECT name, role, token_version FROM users WHERE id = ?", root.id()))
        .containsEntry("name", "Dona do Sistema")
        .containsEntry("role", "ROOT")
        .containsEntry("token_version", 1);
  }
}
