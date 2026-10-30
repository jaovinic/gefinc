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
 * Migração V7 sobre dados anteriores: conta bancária vira PF, as demais ficam sem titular, o cartão
 * antigo segue sem vínculo e as novas restrições do banco passam a valer (Princípio V).
 */
class AccountMigrationV7IT {

  private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

  @BeforeAll
  static void start() {
    POSTGRES.start();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  /** Cada teste parte de um esquema vazio, para controlar até qual migração o banco chega. */
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

  @Test
  void migraContasAntigasSemPerderNadaEAplicaAsRestricoes() throws Exception {
    flyway("6").migrate();
    long userId;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      s.executeUpdate("insert into users (email, password_hash) values ('ana@example.com', 'x')");
      try (ResultSet rs = s.executeQuery("select id from users")) {
        rs.next();
        userId = rs.getLong(1);
      }
      s.executeUpdate(
          "insert into accounts (user_id, name, type) values ("
              + userId
              + ", 'Itaú', 'CHECKING'), ("
              + userId
              + ", 'Carteira', 'CASH')");
      s.executeUpdate(
          "insert into accounts (user_id, name, type, closing_day, due_day) values ("
              + userId
              + ", 'Nubank', 'CREDIT_CARD', 10, 17)");
    }

    flyway("latest").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      try (ResultSet rs =
          s.executeQuery(
              "select name, holder_type, icon, bank_account_id from accounts order by name")) {
        rs.next();
        assertThat(rs.getString("name")).isEqualTo("Carteira");
        assertThat(rs.getString("holder_type")).isNull();
        rs.next();
        assertThat(rs.getString("name")).isEqualTo("Itaú");
        assertThat(rs.getString("holder_type")).isEqualTo("PF");
        assertThat(rs.getString("icon")).isNull();
        rs.next();
        assertThat(rs.getString("name")).isEqualTo("Nubank");
        assertThat(rs.getString("holder_type")).isNull();
        assertThat(rs.getObject("bank_account_id")).isNull();
      }

      // titular só em conta bancária
      assertThatThrownBy(
              () ->
                  s.executeUpdate("update accounts set holder_type = 'PJ' where name = 'Carteira'"))
          .isInstanceOf(SQLException.class);
      // conta bancária sem titular
      assertThatThrownBy(
              () ->
                  s.executeUpdate(
                      "insert into accounts (user_id, name, type) values ("
                          + userId
                          + ", 'Sem titular', 'CHECKING')"))
          .isInstanceOf(SQLException.class);
      // ícone fora do catálogo
      assertThatThrownBy(
              () -> s.executeUpdate("update accounts set icon = 'inexistente' where name = 'Itaú'"))
          .isInstanceOf(SQLException.class);
      // vínculo só em cartão
      assertThatThrownBy(
              () ->
                  s.executeUpdate(
                      "update accounts set bank_account_id = (select id from accounts where name ="
                          + " 'Itaú') where name = 'Carteira'"))
          .isInstanceOf(SQLException.class);
    }
  }

  @Test
  void vinculoDeCartaoComContaDeOutroUsuarioERecusadoPeloBanco() throws Exception {
    flyway("latest").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      s.executeUpdate(
          "insert into users (email, password_hash) values ('a@x.com', 'x'), ('b@x.com', 'x')");
      long a;
      long b;
      try (ResultSet rs = s.executeQuery("select id from users where email = 'a@x.com'")) {
        rs.next();
        a = rs.getLong(1);
      }
      try (ResultSet rs = s.executeQuery("select id from users where email = 'b@x.com'")) {
        rs.next();
        b = rs.getLong(1);
      }
      s.executeUpdate(
          "insert into accounts (user_id, name, type, holder_type) values ("
              + a
              + ", 'Banco A', 'CHECKING', 'PF')");
      long bankA;
      try (ResultSet rs = s.executeQuery("select id from accounts where name = 'Banco A'")) {
        rs.next();
        bankA = rs.getLong(1);
      }
      assertThatThrownBy(
              () ->
                  s.executeUpdate(
                      "insert into accounts (user_id, name, type, closing_day, due_day,"
                          + " bank_account_id) values ("
                          + b
                          + ", 'Cartão B', 'CREDIT_CARD', 10, 17, "
                          + bankA
                          + ")"))
          .isInstanceOf(SQLException.class);
    }
  }
}
