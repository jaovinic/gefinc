package com.jvtech.gefinc.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;

/**
 * O reset de estado dos ITs precisa limpar tabelas protegidas por gatilho de {@code TRUNCATE} (como
 * a auditoria imutável) sem deixar a sessão do pool em modo {@code replica}: o {@code SET LOCAL}
 * vale só dentro da transação do reset.
 */
class IntegrationTestBaseResetIT extends IntegrationTestBase {

  @Value("${spring.datasource.url}")
  private String url;

  @Value("${spring.datasource.username}")
  private String username;

  @Value("${spring.datasource.password}")
  private String password;

  @Test
  void seedCriaUsuariosAdministradoresEORaizQueConseguemEntrar() throws Exception {
    AdminSeed.SeededUser user = seed.createUser("comum@example.com");
    AdminSeed.SeededUser admin = seed.createAdmin("adm@example.com");
    AdminSeed.SeededUser root = seed.createRoot("raiz@example.com");

    assertThat(jdbc.queryForObject("SELECT role FROM users WHERE id = ?", String.class, user.id()))
        .isEqualTo("USER");
    assertThat(jdbc.queryForObject("SELECT role FROM users WHERE id = ?", String.class, admin.id()))
        .isEqualTo("ADMIN");
    assertThat(jdbc.queryForObject("SELECT role FROM users WHERE id = ?", String.class, root.id()))
        .isEqualTo("ROOT");
    assertThat(
            new TestUsers(mockMvc, objectMapper)
                .login("raiz@example.com", TestUsers.PASSWORD)
                .get("accessToken")
                .asText())
        .isNotBlank();

    seed.promoteToRoot("comum@example.com");
    assertThat(jdbc.queryForObject("SELECT role FROM users WHERE id = ?", String.class, user.id()))
        .isEqualTo("ROOT");
    // sem a variável de transação, o gatilho continua recusando
    org.assertj.core.api.Assertions.assertThatThrownBy(
            () -> jdbc.update("UPDATE users SET role = 'ROOT' WHERE id = ?", admin.id()))
        .rootCause()
        .hasMessageContaining("administrador raiz");
  }

  @Test
  void resetRestauraAsSementesDasMigracoes() throws Exception {
    jdbc.update("UPDATE system_parameters SET value = 'false' WHERE key = 'SIGNUPS_OPEN'");
    jdbc.update("UPDATE deletion_reasons SET active = false, name = 'Alterado' WHERE id = 1");
    jdbc.update("INSERT INTO deletion_reasons (name, message) VALUES ('Extra', 'm')");

    resetState();

    assertThat(
            jdbc.queryForObject(
                "SELECT value FROM system_parameters WHERE key = 'SIGNUPS_OPEN'", String.class))
        .isEqualTo("true");
    assertThat(jdbc.queryForList("SELECT name FROM deletion_reasons ORDER BY id", String.class))
        .containsExactlyElementsOf(
            AdminSeed.DELETION_REASONS.stream().map(AdminSeed.Reason::name).toList());
    assertThat(jdbc.queryForObject("SELECT min(id) FROM deletion_reasons", Long.class))
        .isEqualTo(1L);
  }

  @Test
  void resetLimpaTabelaComGatilhoDeTruncateESessaoVoltaAoModoNormal() throws Exception {
    jdbc.execute("CREATE TABLE zz_reset_probe (id INT PRIMARY KEY)");
    try {
      jdbc.execute(
          """
          CREATE FUNCTION zz_reset_probe_block() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'imutavel' USING ERRCODE = 'restrict_violation'; END; $$
          """);
      jdbc.execute(
          "CREATE TRIGGER trg_zz_probe BEFORE TRUNCATE ON zz_reset_probe"
              + " EXECUTE FUNCTION zz_reset_probe_block()");
      jdbc.update("INSERT INTO zz_reset_probe VALUES (1)");

      resetState();

      assertThat(jdbc.queryForObject("SELECT count(*) FROM zz_reset_probe", Long.class)).isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT current_setting('session_replication_role')", String.class))
          .isEqualTo("origin");
      try (Connection c = DriverManager.getConnection(url, username, password);
          Statement s = c.createStatement();
          ResultSet rs = s.executeQuery("SELECT current_setting('session_replication_role')")) {
        rs.next();
        assertThat(rs.getString(1)).isEqualTo("origin");
      }
    } finally {
      jdbc.execute("DROP TABLE IF EXISTS zz_reset_probe");
      jdbc.execute("DROP FUNCTION IF EXISTS zz_reset_probe_block()");
    }
  }
}
