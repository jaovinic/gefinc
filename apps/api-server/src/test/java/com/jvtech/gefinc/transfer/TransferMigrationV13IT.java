package com.jvtech.gefinc.transfer;

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
 * Migração V13 sobre dados anteriores: a tabela nasce vazia (sem preenchimento retroativo) e o
 * banco passa a recusar valor não positivo, origem igual ao destino e contas de outro usuário
 * (Princípio V).
 */
class TransferMigrationV13IT {

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

  private static String insert(long user, long from, long to, String amount) {
    return "insert into account_transfers (user_id, from_account_id, to_account_id, amount,"
        + " transfer_date) values ("
        + user
        + ", "
        + from
        + ", "
        + to
        + ", "
        + amount
        + ", '2026-11-10')";
  }

  @Test
  void tabelaNasceVaziaEOBancoGuardaAsRegras() throws Exception {
    flyway("12").migrate();
    long ana;
    long bia;
    long itau;
    long carteira;
    long alheia;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      ana =
          scalar(
              s, "insert into users (email, password_hash) values ('ana@x.com', 'x') returning id");
      bia =
          scalar(
              s, "insert into users (email, password_hash) values ('bia@x.com', 'x') returning id");
      itau =
          scalar(
              s,
              "insert into accounts (user_id, name, type, holder_type) values ("
                  + ana
                  + ", 'Itaú', 'CHECKING', 'PF') returning id");
      carteira =
          scalar(
              s,
              "insert into accounts (user_id, name, type) values ("
                  + ana
                  + ", 'Carteira', 'CASH') returning id");
      alheia =
          scalar(
              s,
              "insert into accounts (user_id, name, type, holder_type) values ("
                  + bia
                  + ", 'Bradesco', 'CHECKING', 'PF') returning id");
    }

    flyway("latest").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(scalar(s, "select count(*) from account_transfers")).isZero();
      assertThat(scalar(s, "select count(*) from accounts")).isEqualTo(3);

      assertThat(s.executeUpdate(insert(ana, itau, carteira, "10.00"))).isEqualTo(1);
      for (String amount : new String[] {"0", "0.00", "-1.00"}) {
        assertThatThrownBy(() -> s.executeUpdate(insert(ana, itau, carteira, amount)))
            .as(amount)
            .isInstanceOf(SQLException.class);
      }
      assertThatThrownBy(() -> s.executeUpdate(insert(ana, itau, itau, "1.00")))
          .as("origem = destino")
          .isInstanceOf(SQLException.class);
      assertThatThrownBy(() -> s.executeUpdate(insert(ana, itau, alheia, "1.00")))
          .as("destino de outro usuário")
          .isInstanceOf(SQLException.class);
      assertThatThrownBy(() -> s.executeUpdate(insert(ana, alheia, itau, "1.00")))
          .as("origem de outro usuário")
          .isInstanceOf(SQLException.class);
      // Conta com transferência não é excluída em cascata.
      assertThatThrownBy(() -> s.executeUpdate("delete from accounts where id = " + itau))
          .as("conta com transferência")
          .isInstanceOf(SQLException.class);
      assertThat(scalar(s, "select count(*) from account_transfers")).isEqualTo(1);

      // Excluir o usuário leva as transferências junto.
      s.executeUpdate("delete from users where id = " + ana);
      assertThat(scalar(s, "select count(*) from account_transfers")).isZero();
    }
  }
}
