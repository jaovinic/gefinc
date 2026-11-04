package com.jvtech.gefinc.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Migração V12 sobre dados anteriores: as contas existentes seguem sem cor (sem preenchimento) e o
 * banco passa a aceitar apenas {@code #RRGGBB} em maiúsculas ou nulo (Princípio V).
 */
class AccountMigrationV12IT {

  private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

  @BeforeAll
  static void start() {
    POSTGRES.start();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @BeforeEach
  void resetSchema() throws SQLException {
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      s.execute("drop schema public cascade");
      s.execute("create schema public");
    }
  }

  private Flyway flyway(String target) {
    return Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .target(target)
        .load();
  }

  private Connection connection() throws SQLException {
    return DriverManager.getConnection(
        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  private static long scalar(Statement s, String sql) throws SQLException {
    try (ResultSet rs = s.executeQuery(sql)) {
      rs.next();
      return rs.getLong(1);
    }
  }

  @Test
  void contasAnterioresMigramSemCorEOBancoPassaARecusarCorInvalida() throws Exception {
    flyway("11").migrate();
    long userId;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      userId =
          scalar(
              s,
              "insert into users (email, password_hash) values ('ana@example.com', 'x') returning"
                  + " id");
      s.executeUpdate(
          "insert into accounts (user_id, name, type, holder_type) values ("
              + userId
              + ", 'Itaú', 'CHECKING', 'PF'), ("
              + userId
              + ", 'Carteira', 'CASH', null)");
    }

    flyway("latest").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(scalar(s, "select count(*) from accounts")).isEqualTo(2);
      assertThat(scalar(s, "select count(*) from accounts where color_hex is null")).isEqualTo(2);

      s.executeUpdate("update accounts set color_hex = '#2563EB' where name = 'Itaú'");
      s.executeUpdate("update accounts set color_hex = null where name = 'Itaú'");
      for (String invalid : new String[] {"red", "#12345", "#GGGGGG", "#2563eb", "2563EB", ""}) {
        assertThatThrownBy(
                () ->
                    s.executeUpdate(
                        "update accounts set color_hex = '"
                            + invalid
                            + "' where name = 'Carteira'"))
            .as(invalid)
            .isInstanceOf(SQLException.class);
      }
    }
  }
}
