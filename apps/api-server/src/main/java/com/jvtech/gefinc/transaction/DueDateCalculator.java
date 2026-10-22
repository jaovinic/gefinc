package com.jvtech.gefinc.transaction;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * Vencimento da fatura do cartão (FR-021). Mesma regra do módulo TypeScript {@code due-date.ts}; os
 * dois são testados com os vetores de {@code packages/core-models/fixtures/installments.json}.
 *
 * <ul>
 *   <li>Compra até o dia de fechamento (inclusive) entra na fatura que fecha no próprio mês;
 *       depois, na do mês seguinte.
 *   <li>Se o dia de vencimento é maior que o de fechamento, a fatura vence no mês do fechamento;
 *       senão, no mês seguinte.
 *   <li>Dias 29 a 31 em meses curtos usam o último dia do mês.
 * </ul>
 */
public final class DueDateCalculator {

  private DueDateCalculator() {}

  public static LocalDate invoiceDueDate(LocalDate purchaseDate, int closingDay, int dueDay) {
    YearMonth purchaseMonth = YearMonth.from(purchaseDate);
    int closingInPurchaseMonth = Math.min(closingDay, purchaseMonth.lengthOfMonth());
    YearMonth closingMonth =
        purchaseDate.getDayOfMonth() <= closingInPurchaseMonth
            ? purchaseMonth
            : purchaseMonth.plusMonths(1);
    YearMonth dueMonth = dueDay > closingDay ? closingMonth : closingMonth.plusMonths(1);
    return dueMonth.atDay(Math.min(dueDay, dueMonth.lengthOfMonth()));
  }

  /**
   * Vencimento da ocorrência de um lançamento fixo no cartão: cada mês é tratado como uma compra no
   * dia da data de compra original, limitado ao último dia daquele mês.
   */
  public static LocalDate fixedOccurrenceDueDate(
      LocalDate originalPurchaseDate, int year, int month, int closingDay, int dueDay) {
    YearMonth ym = YearMonth.of(year, month);
    LocalDate purchase =
        ym.atDay(Math.min(originalPurchaseDate.getDayOfMonth(), ym.lengthOfMonth()));
    return invoiceDueDate(purchase, closingDay, dueDay);
  }
}
