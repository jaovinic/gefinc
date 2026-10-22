package com.jvtech.gefinc.transaction;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/** Vencimento da fatura do cartão; usa os mesmos vetores de teste do módulo TypeScript. */
class DueDateCalculatorTest {

  private static final Path FIXTURES =
      Path.of("..", "..", "packages", "core-models", "fixtures", "installments.json");

  @TestFactory
  List<DynamicTest> vetoresCompartilhados() throws IOException {
    JsonNode root = new ObjectMapper().readTree(FIXTURES.toFile());
    List<DynamicTest> tests = new ArrayList<>();
    for (JsonNode vector : root.get("dueDate")) {
      tests.add(
          DynamicTest.dynamicTest(
              vector.get("name").asText(),
              () ->
                  assertThat(
                          DueDateCalculator.invoiceDueDate(
                              LocalDate.parse(vector.get("purchaseDate").asText()),
                              vector.get("closingDay").asInt(),
                              vector.get("dueDay").asInt()))
                      .isEqualTo(LocalDate.parse(vector.get("expected").asText()))));
    }
    assertThat(tests).hasSizeGreaterThanOrEqualTo(10);
    return tests;
  }

  @Test
  void ocorrenciaFixaTrataCadaMesComoCompraNoDiaDaDataDeCompra() {
    // assinatura comprada no dia 5, cartão fecha dia 10 e vence dia 17: vence no dia 17 de cada mês
    LocalDate purchase = LocalDate.of(2026, 11, 5);
    assertThat(DueDateCalculator.fixedOccurrenceDueDate(purchase, 2026, 12, 10, 17))
        .isEqualTo(LocalDate.of(2026, 12, 17));
    assertThat(DueDateCalculator.fixedOccurrenceDueDate(purchase, 2027, 1, 10, 17))
        .isEqualTo(LocalDate.of(2027, 1, 17));
  }

  @Test
  void ocorrenciaFixaComCompraAposOFechamentoVaiParaAFaturaDoMesSeguinte() {
    LocalDate purchase = LocalDate.of(2026, 11, 12);
    assertThat(DueDateCalculator.fixedOccurrenceDueDate(purchase, 2026, 12, 10, 17))
        .isEqualTo(LocalDate.of(2027, 1, 17));
  }

  @Test
  void ocorrenciaFixaLimitaODiaDaCompraAoUltimoDiaDoMes() {
    // compra dia 31: em fevereiro vale dia 28, que está antes do fechamento (dia 28) e vence em
    // fevereiro
    LocalDate purchase = LocalDate.of(2026, 1, 31);
    assertThat(DueDateCalculator.fixedOccurrenceDueDate(purchase, 2026, 2, 28, 30))
        .isEqualTo(LocalDate.of(2026, 2, 28));
  }
}
