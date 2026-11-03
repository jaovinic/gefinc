package com.jvtech.gefinc.category;

import static org.assertj.core.api.Assertions.assertThat;

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
 * Migração V11 sobre dados anteriores: a categoria de despesa "Compras" com a cor padrão antiga
 * (#A855F7, lilás) passa ao verde #16A34A; cor personalizada, outras categorias, categorias de
 * receita e usuários diferentes não são afetados entre si.
 */
class CategoryColorMigrationV11IT {

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

  private static long user(Statement s, String email) throws SQLException {
    return scalar(
        s, "insert into users (email, password_hash) values ('" + email + "', 'x') returning id");
  }

  private static long category(Statement s, long user, String name, String type, String color)
      throws SQLException {
    return scalar(
        s,
        "insert into categories (user_id, name, type, color_hex) values ("
            + user
            + ", '"
            + name
            + "', '"
            + type
            + "', '"
            + color
            + "') returning id");
  }

  private static String color(Statement s, long id) throws SQLException {
    try (ResultSet rs = s.executeQuery("select color_hex from categories where id = " + id)) {
      rs.next();
      return rs.getString(1);
    }
  }

  @Test
  void comprasComACorPadraoAntigaViraVerde() throws Exception {
    flyway("10").migrate();
    long compras;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      compras = category(s, user(s, "ana@example.com"), "Compras", "EXPENSE", "#A855F7");
    }

    flyway("latest").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(color(s, compras)).isEqualTo("#16A34A");
    }
  }

  @Test
  void ignoraMaiusculasNoNomeENaCorAoLocalizarOPadraoAntigo() throws Exception {
    flyway("10").migrate();
    long minusculas;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      minusculas = category(s, user(s, "ana@example.com"), "COMPRAS", "EXPENSE", "#a855f7");
    }

    flyway("latest").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(color(s, minusculas)).isEqualTo("#16A34A");
    }
  }

  @Test
  void comprasComCorPersonalizadaNaoMuda() throws Exception {
    flyway("10").migrate();
    long compras;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      compras = category(s, user(s, "ana@example.com"), "Compras", "EXPENSE", "#123456");
    }

    flyway("latest").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(color(s, compras)).isEqualTo("#123456");
    }
  }

  @Test
  void outraCategoriaComALilasNaoMuda() throws Exception {
    flyway("10").migrate();
    long outra;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      outra = category(s, user(s, "ana@example.com"), "Presentes", "EXPENSE", "#A855F7");
    }

    flyway("latest").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(color(s, outra)).isEqualTo("#A855F7");
    }
  }

  @Test
  void comprasDeReceitaNaoMuda() throws Exception {
    flyway("10").migrate();
    long receita;
    long despesa;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      long ana = user(s, "ana@example.com");
      receita = category(s, ana, "Compras", "INCOME", "#A855F7");
      despesa = category(s, ana, "Compras", "EXPENSE", "#A855F7");
    }

    flyway("latest").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(color(s, receita)).isEqualTo("#A855F7");
      assertThat(color(s, despesa)).isEqualTo("#16A34A");
    }
  }

  @Test
  void usuariosDiferentesNaoInterferemEntreSi() throws Exception {
    flyway("10").migrate();
    long padraoAna;
    long personalizadaBia;
    long padraoCaio;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      padraoAna = category(s, user(s, "ana@example.com"), "Compras", "EXPENSE", "#A855F7");
      personalizadaBia = category(s, user(s, "bia@example.com"), "Compras", "EXPENSE", "#0EA5E9");
      padraoCaio = category(s, user(s, "caio@example.com"), "Compras", "EXPENSE", "#A855F7");
    }

    flyway("latest").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(color(s, padraoAna)).isEqualTo("#16A34A");
      assertThat(color(s, personalizadaBia)).isEqualTo("#0EA5E9");
      assertThat(color(s, padraoCaio)).isEqualTo("#16A34A");
    }
  }
}
