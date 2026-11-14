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
 * {@code admin/**} importa os pacotes financeiros. A única exceção é {@code
 * admin/system/UsageStatsRepository}, que só conta linhas. Pode importar {@code auth}, {@code user}
 * e {@code common}.
 */
class AdminModuleBoundaryTest {

  private static final Path ADMIN_SOURCES =
      Path.of("src/main/java/com/jvtech/gefinc/admin").toAbsolutePath();

  private static final Pattern FORBIDDEN =
      Pattern.compile(
          "\\bcom\\.jvtech\\.gefinc\\.(account|category|transaction|invoice|transfer|dashboard)\\b");

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
  void oDetectorPegaImportEUsoQualificadoMasNaoOsPacotesPermitidos() {
    assertThat(violations("import com.jvtech.gefinc.account.Account;")).hasSize(1);
    assertThat(violations("var x = com.jvtech.gefinc.transaction.Transaction.class;")).hasSize(1);
    assertThat(violations("import com.jvtech.gefinc.dashboard.Dash;")).hasSize(1);
    assertThat(violations("import com.jvtech.gefinc.auth.AuthService;")).isEmpty();
    assertThat(violations("import com.jvtech.gefinc.user.User;")).isEmpty();
    assertThat(violations("import com.jvtech.gefinc.common.error.ApiException;")).isEmpty();
  }
}
