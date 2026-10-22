package com.jvtech.gefinc.transaction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/** Agenda de parcelas; usa os mesmos vetores de teste do módulo TypeScript. */
class InstallmentSchedulerTest {

  private static final Path FIXTURES =
      Path.of("..", "..", "packages", "core-models", "fixtures", "installments.json");

  @TestFactory
  List<DynamicTest> vetoresCompartilhados() throws IOException {
    JsonNode root = new ObjectMapper().readTree(FIXTURES.toFile());
    List<DynamicTest> tests = new ArrayList<>();
    for (JsonNode vector : root.get("installments")) {
      tests.add(DynamicTest.dynamicTest(vector.get("name").asText(), () -> check(vector)));
    }
    assertThat(tests).hasSizeGreaterThanOrEqualTo(9);
    return tests;
  }

  private void check(JsonNode vector) {
    boolean card = "card".equals(vector.get("kind").asText());
    List<InstallmentScheduler.Installment> result =
        InstallmentScheduler.schedule(
            card ? vector.get("closingDay").asInt() : null,
            card ? vector.get("dueDay").asInt() : null,
            LocalDate.parse(vector.get("purchaseDate").asText()),
            card ? null : LocalDate.parse(vector.get("firstDueDate").asText()),
            new BigDecimal(vector.get("total").asText()),
            vector.get("count").asInt());

    JsonNode expected = vector.get("expected");
    assertThat(result).hasSize(expected.size());
    for (int i = 0; i < expected.size(); i++) {
      assertThat(result.get(i).number()).isEqualTo(expected.get(i).get("number").asInt());
      assertThat(result.get(i).amount())
          .isEqualByComparingTo(expected.get(i).get("amount").asText());
      assertThat(result.get(i).dueDate())
          .isEqualTo(LocalDate.parse(expected.get(i).get("dueDate").asText()));
    }
    BigDecimal sum =
        result.stream()
            .map(InstallmentScheduler.Installment::amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    assertThat(sum).isEqualByComparingTo(vector.get("total").asText());
  }

  @Test
  void somaDasParcelasEIgualAoTotalParaMuitosCasos() {
    for (String total : new String[] {"999.99", "1.00", "10000.01", "0.07"}) {
      for (int count : new int[] {2, 3, 7, 12}) {
        if (new BigDecimal(total).movePointRight(2).intValue() < count) {
          continue;
        }
        BigDecimal sum =
            InstallmentScheduler.schedule(
                    null,
                    null,
                    LocalDate.of(2026, 1, 1),
                    LocalDate.of(2026, 1, 31),
                    new BigDecimal(total),
                    count)
                .stream()
                .map(InstallmentScheduler.Installment::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(sum).as("%s em %d", total, count).isEqualByComparingTo(total);
      }
    }
  }

  @Test
  void recusaTotalMenorQueUmCentavoPorParcela() {
    assertThatThrownBy(
            () ->
                InstallmentScheduler.schedule(
                    null,
                    null,
                    LocalDate.of(2026, 1, 1),
                    LocalDate.of(2026, 1, 31),
                    new BigDecimal("0.01"),
                    2))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
