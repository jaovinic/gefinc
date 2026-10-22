package com.jvtech.gefinc.invoice;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class InvoiceCalculatorTest {

  private static BigDecimal money(String value) {
    return new BigDecimal(value);
  }

  @Test
  void restanteEOTotalMenosOPagoIndividualMenosOPagoPelaFatura() {
    var amounts = new InvoiceCalculator.Amounts(money("1000.00"), money("100.00"), money("300.00"));

    assertThat(amounts.remaining()).isEqualByComparingTo("600.00");
  }

  @Test
  void faturaSemPagamentosTemRestanteIgualAoTotal() {
    var amounts = new InvoiceCalculator.Amounts(money("250.50"), BigDecimal.ZERO, BigDecimal.ZERO);

    assertThat(amounts.remaining()).isEqualByComparingTo("250.50");
    assertThat(amounts.isOverpaid()).isFalse();
  }

  @Test
  void faturaQuitadaTemRestanteZero() {
    var amounts = new InvoiceCalculator.Amounts(money("1000.00"), money("400.00"), money("600.00"));

    assertThat(amounts.remaining()).isEqualByComparingTo("0.00");
    assertThat(amounts.isOverpaid()).isFalse();
  }

  @Test
  void pagoAMaisFicaNegativoEEMarcadoComoViolacao() {
    var amounts = new InvoiceCalculator.Amounts(money("1000.00"), money("400.00"), money("700.00"));

    assertThat(amounts.remaining()).isEqualByComparingTo("-100.00");
    assertThat(amounts.isOverpaid()).isTrue();
  }

  @Test
  void pagamentoCabeSeNaoUltrapassaORestante() {
    var amounts = new InvoiceCalculator.Amounts(money("1000.00"), BigDecimal.ZERO, money("300.00"));

    assertThat(amounts.accepts(money("700.00"))).isTrue();
    assertThat(amounts.accepts(money("700.01"))).isFalse();
    assertThat(amounts.accepts(money("0.00"))).isFalse();
    assertThat(amounts.accepts(money("-1.00"))).isFalse();
  }
}
