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
import java.util.Arrays;
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

  @TestFactory
  List<DynamicTest> divisaoCompartilhada() throws IOException {
    JsonNode root = new ObjectMapper().readTree(FIXTURES.toFile());
    List<DynamicTest> tests = new ArrayList<>();
    for (JsonNode vector : root.get("split")) {
      tests.add(
          DynamicTest.dynamicTest(
              vector.get("name").asText(),
              () -> {
                long cents =
                    new BigDecimal(vector.get("total").asText()).movePointRight(2).longValueExact();
                long[] parts = InstallmentScheduler.split(cents, vector.get("count").asInt());
                JsonNode expected = vector.get("expected");
                assertThat(parts).hasSize(expected.size());
                for (int i = 0; i < parts.length; i++) {
                  assertThat(BigDecimal.valueOf(parts[i], 2))
                      .isEqualByComparingTo(expected.get(i).asText());
                }
                assertThat(Arrays.stream(parts).sum()).isEqualTo(cents);
              }));
    }
    assertThat(tests).hasSizeGreaterThanOrEqualTo(10);
    return tests;
  }

  @TestFactory
  List<DynamicTest> divisaoInvalidaCompartilhada() throws IOException {
    JsonNode root = new ObjectMapper().readTree(FIXTURES.toFile());
    List<DynamicTest> tests = new ArrayList<>();
    for (JsonNode vector : root.get("splitInvalid")) {
      tests.add(
          DynamicTest.dynamicTest(
              vector.get("name").asText(),
              () ->
                  assertThatThrownBy(
                          () ->
                              InstallmentScheduler.schedule(
                                  null,
                                  null,
                                  LocalDate.of(2026, 1, 1),
                                  LocalDate.of(2026, 1, 31),
                                  new BigDecimal(vector.get("total").asText()),
                                  vector.get("count").asInt()))
                      .isInstanceOf(IllegalArgumentException.class)));
    }
    assertThat(tests).isNotEmpty();
    return tests;
  }

  @Test
  void propriedadesDaDivisao() {
    long[] totais = {
      1, 3, 7, 99, 100, 10_000, 13_430, 99_999, 123_456_789L, 99_999_999_999_999_999L
    };
    for (long cents : totais) {
      for (int count = 1; count <= 120; count++) {
        if (cents < count) {
          continue;
        }
        long[] parts = InstallmentScheduler.split(cents, count);
        assertThat(parts).as("%d em %d", cents, count).hasSize(count);
        assertThat(Arrays.stream(parts).sum()).isEqualTo(cents);
        for (int i = 1; i < count; i++) {
          assertThat(parts[i]).isEqualTo(parts[1]);
          assertThat(parts[0]).isGreaterThanOrEqualTo(parts[i]);
          assertThat(parts[0] - parts[i]).isLessThanOrEqualTo(count - 1);
        }
        assertThat(parts[count - 1]).isGreaterThanOrEqualTo(1);
      }
    }
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
