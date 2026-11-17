package com.jvtech.gefinc.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * O módulo administrativo nunca enxerga dado financeiro (SC-004, Princípio III): nenhum arquivo de
 * {@code admin/**} importa os pacotes financeiros nem escreve SQL contra as tabelas financeiras
 * (contas, cartões, categorias, lançamentos, transferências e faturas). A única exceção é {@code
 * admin/system/UsageStatsRepository}, que só conta linhas. Pode importar {@code auth}, {@code user}
 * e {@code common}.
 */
class AdminModuleBoundaryTest {

  private static final Path ADMIN_SOURCES =
      Path.of("src/main/java/com/jvtech/gefinc/admin").toAbsolutePath();

  private static final Pattern FORBIDDEN =
      Pattern.compile(
          "\\bcom\\.jvtech\\.gefinc\\.(account|category|transaction|invoice|transfer|dashboard)\\b");

  /**
   * SQL contra tabela financeira: o nome depois de uma cláusula que acessa tabela. Cobre os nomes
   * do contrato e as tabelas reais do esquema ({@code account_transfers}, {@code
   * transaction_groups}, {@code invoice_payments}).
   */
  private static final Pattern FINANCIAL_SQL =
      Pattern.compile(
          "\\b(?:from|join|into|update|truncate|table)\\s+(?:only\\s+)?(?:public\\.)?\"?"
              + "(?:accounts|cards|categories|transactions|transfers|invoices|account_transfers"
              + "|transaction_groups|invoice_payments)\\b",
          Pattern.CASE_INSENSITIVE);

  private static final String EXCEPTION = "system/UsageStatsRepository.java";

  static List<String> violations(String source) {
    List<String> found = new ArrayList<>();
    for (String line : source.split("\n")) {
      if (FORBIDDEN.matcher(line).find()) {
        found.add(line.strip());
      }
    }
    return found;
  }

  static List<String> sqlViolations(String source) {
    List<String> found = new ArrayList<>();
    for (String line : source.split("\n")) {
      if (FINANCIAL_SQL.matcher(line).find()) {
        found.add(line.strip());
      }
    }
    return found;
  }

  @Test
  void aFonteDoModuloExiste() {
    assertThat(ADMIN_SOURCES).isDirectory();
  }

  @Test
  void nenhumArquivoDoModuloAdminImportaPacotesFinanceiros() throws IOException {
    List<String> offenders = new ArrayList<>();
    try (Stream<Path> files = Files.walk(ADMIN_SOURCES)) {
      for (Path file : files.filter(f -> f.toString().endsWith(".java")).toList()) {
        String relative = ADMIN_SOURCES.relativize(file).toString().replace('\\', '/');
        if (relative.equals(EXCEPTION)) {
          continue;
        }
        for (String line : violations(Files.readString(file))) {
          offenders.add(relative + ": " + line);
        }
      }
    }

    assertThat(offenders).as("imports financeiros no módulo admin").isEmpty();
  }

  @Test
  void nenhumArquivoDoModuloAdminEscreveSqlContraTabelasFinanceiras() throws IOException {
    List<String> offenders = new ArrayList<>();
    try (Stream<Path> files = Files.walk(ADMIN_SOURCES)) {
      for (Path file : files.filter(f -> f.toString().endsWith(".java")).toList()) {
        String relative = ADMIN_SOURCES.relativize(file).toString().replace('\\', '/');
        if (relative.equals(EXCEPTION)) {
          continue;
        }
        for (String line : sqlViolations(Files.readString(file))) {
          offenders.add(relative + ": " + line);
        }
      }
    }

    assertThat(offenders).as("SQL financeiro no módulo admin").isEmpty();
  }

  @Test
  void oDetectorDeSqlPegaAsTabelasFinanceirasMasNaoAsDeContaEAuditoria() {
    assertThat(sqlViolations("\"SELECT count(*) FROM accounts WHERE user_id = ?\"")).hasSize(1);
    assertThat(sqlViolations("\"select 1 from public.transactions t\"")).hasSize(1);
    assertThat(sqlViolations("\"SELECT 1 FROM transaction_groups\"")).hasSize(1);
    assertThat(sqlViolations("\" JOIN categories c ON c.id = t.category_id\"")).hasSize(1);
    assertThat(sqlViolations("\"DELETE FROM cards\"")).hasSize(1);
    assertThat(sqlViolations("\"INSERT INTO invoices (id) VALUES (1)\"")).hasSize(1);
    assertThat(sqlViolations("\"UPDATE transfers SET x = 1\"")).hasSize(1);
    assertThat(sqlViolations("\"SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id = u.id\""))
        .isEmpty();
    assertThat(sqlViolations("\"SELECT 1 FROM audit_log\"")).isEmpty();
    assertThat(sqlViolations("// os dados de accounts ficam fora do painel")).isEmpty();
  }

  @Test
  void oDetectorPegaImportEUsoQualificadoMasNaoOsPacotesPermitidos() {
    assertThat(violations("import com.jvtech.gefinc.account.Account;")).hasSize(1);
    assertThat(violations("var x = com.jvtech.gefinc.transaction.Transaction.class;")).hasSize(1);
    assertThat(violations("import com.jvtech.gefinc.dashboard.Dash;")).hasSize(1);
    assertThat(violations("import com.jvtech.gefinc.auth.AuthService;")).isEmpty();
    assertThat(violations("import com.jvtech.gefinc.user.User;")).isEmpty();
    assertThat(violations("import com.jvtech.gefinc.common.error.ApiException;")).isEmpty();
  }
}
