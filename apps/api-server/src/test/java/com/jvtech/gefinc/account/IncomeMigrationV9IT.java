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
 * Migrações V9 e V10 sobre dados anteriores: receita pendente e vencida (fora de cartão) vira
 * recebida na data de vencimento; futura, despesa e receita em cartão ficam como estão; a conta
 * ganha o saldo inicial, proibido em cartão.
 */
class IncomeMigrationV9IT {

  private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

  private static final String TODAY = "(now() at time zone 'America/Sao_Paulo')::date";

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

  /** Insere um grupo avulso e a sua única ocorrência pendente; devolve o id da ocorrência. */
  private static long pending(
      Statement s, long user, long account, long category, String description, String dueSql)
      throws SQLException {
    long group =
        scalar(
            s,
            "insert into transaction_groups (user_id, description, recurrence_type, total_amount,"
                + " account_id, category_id, purchase_date, first_due_date) values ("
                + user
                + ", '"
                + description
                + "', 'VARIABLE', 100.00, "
                + account
                + ", "
                + category
                + ", "
                + dueSql
                + ", "
                + dueSql
                + ") returning id");
    return scalar(
        s,
        "insert into transactions (group_id, user_id, account_id, category_id, installment_number,"
            + " reference_month, amount, due_date, status) values ("
            + group
            + ", "
            + user
            + ", "
            + account
            + ", "
            + category
            + ", 1, date_trunc('month', "
            + dueSql
            + ")::date, 100.00, "
            + dueSql
            + ", 'PENDING') returning id");
  }

  @Test
  void liquidaReceitaPendenteVencidaEDeixaORestanteIntacto() throws Exception {
    flyway("8").migrate();
    long pastIncome;
    long todayIncome;
    long futureIncome;
    long pastExpense;
    long cardIncome;
    long userId;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      userId =
          scalar(
              s,
              "insert into users (email, password_hash) values ('ana@example.com', 'x')"
                  + " returning id");
      long bank =
          scalar(
              s,
              "insert into accounts (user_id, name, type, holder_type) values ("
                  + userId
                  + ", 'Itaú', 'CHECKING', 'PF') returning id");
      long card =
          scalar(
              s,
              "insert into accounts (user_id, name, type, closing_day, due_day) values ("
                  + userId
                  + ", 'Nubank', 'CREDIT_CARD', 10, 17) returning id");
      long income =
          scalar(
              s,
              "insert into categories (user_id, name, type, color_hex) values ("
                  + userId
                  + ", 'Salário', 'INCOME', '#00AA00') returning id");
      long expense =
          scalar(
              s,
              "insert into categories (user_id, name, type, color_hex) values ("
                  + userId
                  + ", 'Mercado', 'EXPENSE', '#AA0000') returning id");
      pastIncome = pending(s, userId, bank, income, "Passada", TODAY + " - 5");
      todayIncome = pending(s, userId, bank, income, "Hoje", TODAY);
      futureIncome = pending(s, userId, bank, income, "Futura", TODAY + " + 5");
      pastExpense = pending(s, userId, bank, expense, "Despesa", TODAY + " - 5");
      cardIncome = pending(s, userId, card, income, "No cartão", TODAY + " - 5");
    }

    flyway("latest").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(row(s, pastIncome)).isEqualTo("PAID|true|1");
      assertThat(row(s, todayIncome)).isEqualTo("PAID|true|1");
      assertThat(row(s, futureIncome)).isEqualTo("PENDING|false|0");
      assertThat(row(s, pastExpense)).isEqualTo("PENDING|false|0");
      assertThat(row(s, cardIncome)).isEqualTo("PENDING|false|0");
    }
  }

  /** Status, se a data de pagamento é igual ao vencimento e quantas versões subiu. */
  private String row(Statement s, long id) throws SQLException {
    try (ResultSet rs =
        s.executeQuery(
            "select status, payment_date = due_date, version from transactions where id = " + id)) {
      rs.next();
      return rs.getString(1) + "|" + rs.getBoolean(2) + "|" + rs.getLong(3);
    }
  }

  @Test
  void saldoInicialComecaEmZeroEOCartaoNaoAceitaValor() throws Exception {
    flyway("8").migrate();
    long userId;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      userId =
          scalar(
              s,
              "insert into users (email, password_hash) values ('ana@example.com', 'x')"
                  + " returning id");
      s.executeUpdate(
          "insert into accounts (user_id, name, type, holder_type) values ("
              + userId
              + ", 'Itaú', 'CHECKING', 'PF')");
      s.executeUpdate(
          "insert into accounts (user_id, name, type, closing_day, due_day) values ("
              + userId
              + ", 'Nubank', 'CREDIT_CARD', 10, 17)");
    }

    flyway("latest").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(scalar(s, "select count(*) from accounts where opening_balance = 0")).isEqualTo(2);
      s.executeUpdate("update accounts set opening_balance = 150.25 where name = 'Itaú'");
      assertThat(scalar(s, "select count(*) from accounts where opening_balance = 150.25"))
          .isEqualTo(1);
      assertThatThrownBy(
              () ->
                  s.executeUpdate("update accounts set opening_balance = 1 where name = 'Nubank'"))
          .isInstanceOf(SQLException.class);
    }
  }
}
