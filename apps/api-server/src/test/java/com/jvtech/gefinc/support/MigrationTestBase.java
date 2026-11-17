package com.jvtech.gefinc.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Base dos testes de migração sobre dados anteriores: PostgreSQL 16 real compartilhado pela JVM,
 * esquema recriado a cada teste e Flyway levado até a versão desejada ({@link #flyway(String)}).
 * Não sobe o contexto Spring.
 */
public abstract class MigrationTestBase {

  protected static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

  static {
    POSTGRES.start();
  }

  @BeforeEach
  void resetSchema() throws SQLException {
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      s.execute("drop schema public cascade");
      s.execute("create schema public");
    }
  }

  protected Flyway flyway(String target) {
    return Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .target(target)
        .load();
  }

  protected Connection connection() throws SQLException {
    return DriverManager.getConnection(
        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  protected static long scalar(Statement s, String sql) throws SQLException {
    try (ResultSet rs = s.executeQuery(sql)) {
      rs.next();
      return rs.getLong(1);
    }
  }

  protected static String text(Statement s, String sql) throws SQLException {
    try (ResultSet rs = s.executeQuery(sql)) {
      rs.next();
      return rs.getString(1);
    }
  }

  /** Executa o SQL e confere que o banco recusa com o SQLState esperado (ex.: 23514, 23505). */
  protected static void assertRejected(Connection c, String sql, String sqlState)
      throws SQLException {
    c.setAutoCommit(true);
    try (Statement s = c.createStatement()) {
      assertThatThrownBy(() -> s.execute(sql))
          .as(sql)
          .isInstanceOfSatisfying(
              SQLException.class, e -> assertThat(e.getSQLState()).as(sql).isEqualTo(sqlState));
    }
  }

  protected static boolean indexExists(Statement s, String name) throws SQLException {
    return scalar(s, "select count(*) from pg_indexes where indexname = '" + name + "'") == 1;
  }
}
