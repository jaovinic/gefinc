package com.jvtech.gefinc.transaction;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/**
 * Agenda de parcelas (FR-020 a FR-023). Mesma regra do módulo TypeScript {@code installments.ts};
 * os dois são testados com os vetores de {@code packages/core-models/fixtures/installments.json}.
 *
 * <ul>
 *   <li>Cartão: o vencimento da primeira parcela vem do fechamento e do vencimento da fatura; as
 *       demais vencem no mesmo dia dos meses seguintes.
 *   <li>Demais contas: parcelas mensais a partir do primeiro vencimento informado, preservando o
 *       dia original (31/01 → 28/02 → 31/03).
 *   <li>O valor é dividido em centavos inteiros e o resto fica na última parcela, de modo que a
 *       soma é exatamente o total.
 * </ul>
 */
public final class InstallmentScheduler {

  private InstallmentScheduler() {}

  public record Installment(int number, BigDecimal amount, LocalDate dueDate) {}

  /**
   * @param closingDay dia de fechamento do cartão, ou {@code null} fora do cartão
   * @param dueDay dia de vencimento do cartão, ou {@code null} fora do cartão
   * @param firstDueDate primeiro vencimento; obrigatório fora do cartão
   */
  public static List<Installment> schedule(
      Integer closingDay,
      Integer dueDay,
      LocalDate purchaseDate,
      LocalDate firstDueDate,
      BigDecimal total,
      int count) {
    long cents = total.movePointRight(2).longValueExact();
    if (count < 1 || cents < count) {
      throw new IllegalArgumentException(
          "O total " + total + " não pode ser dividido em " + count + " parcelas");
    }
    boolean card = closingDay != null && dueDay != null;
    LocalDate firstDue;
    int anchorDay;
    if (card) {
      firstDue = DueDateCalculator.invoiceDueDate(purchaseDate, closingDay, dueDay);
      anchorDay = dueDay;
    } else {
      if (firstDueDate == null) {
        throw new IllegalArgumentException("O primeiro vencimento é obrigatório fora do cartão");
      }
      firstDue = firstDueDate;
      anchorDay = firstDueDate.getDayOfMonth();
    }
    long base = cents / count;
    List<Installment> installments = new ArrayList<>(count);
    for (int index = 0; index < count; index++) {
      long amountCents = index == count - 1 ? cents - base * (count - 1) : base;
      LocalDate due =
          index == 0
              ? firstDue
              : YearMonth.from(firstDue)
                  .plusMonths(index)
                  .atDay(
                      Math.min(
                          anchorDay, YearMonth.from(firstDue).plusMonths(index).lengthOfMonth()));
      installments.add(new Installment(index + 1, BigDecimal.valueOf(amountCents, 2), due));
    }
    return installments;
  }
}
