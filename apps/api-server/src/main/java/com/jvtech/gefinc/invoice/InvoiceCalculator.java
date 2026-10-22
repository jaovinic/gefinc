package com.jvtech.gefinc.invoice;

import java.math.BigDecimal;

/**
 * Valores de uma fatura: {@code restante = total − pago individualmente − pago por pagamentos de
 * fatura}. O restante nunca pode ficar negativo (FR-038).
 */
public final class InvoiceCalculator {

  private InvoiceCalculator() {}

  /**
   * @param total soma de todos os itens da fatura
   * @param paidIndividually itens pagos um a um (não quitados por pagamento de fatura)
   * @param paidByInvoicePayments soma dos pagamentos registrados na fatura
   */
  public record Amounts(
      BigDecimal total, BigDecimal paidIndividually, BigDecimal paidByInvoicePayments) {

    public BigDecimal remaining() {
      return total.subtract(paidIndividually).subtract(paidByInvoicePayments);
    }

    public boolean isOverpaid() {
      return remaining().signum() < 0;
    }

    /** Um pagamento é aceito se for positivo e não ultrapassar o restante. */
    public boolean accepts(BigDecimal payment) {
      return payment.signum() > 0 && payment.compareTo(remaining()) <= 0;
    }
  }
}
