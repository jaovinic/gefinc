package com.jvtech.gefinc.transaction;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Arrays;
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
 *   <li>O valor é dividido em centavos inteiros e o resto da divisão fica todo na primeira parcela
 *       (convenção das adquirentes: 134,30 em 4x = 33,59 + 3 x 33,57), de modo que a soma é
 *       exatamente o total.
 * </ul>
 */
public final class InstallmentScheduler {

  private InstallmentScheduler() {}

  public record Installment(int number, BigDecimal amount, LocalDate dueDate) {}

  /**
   * Divide {@code cents} em {@code count} parcelas: {@code base = cents / count}; a primeira recebe
   * {@code base + resto} e as demais, {@code base}. A soma é sempre {@code cents}.
   */
  public static long[] split(long cents, int count) {
    if (count < 1 || cents < count) {
      throw new IllegalArgumentException(
          "O total de " + cents + " centavos não pode ser dividido em " + count + " parcelas");
    }
    long base = cents / count;
    long[] parts = new long[count];
    Arrays.fill(parts, base);
    parts[0] = cents - base * (count - 1);
    return parts;
  }

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
    long[] parts = split(cents, count);
    List<Installment> installments = new ArrayList<>(count);
    for (int index = 0; index < count; index++) {
      LocalDate due =
          index == 0
              ? firstDue
              : YearMonth.from(firstDue)
                  .plusMonths(index)
                  .atDay(
                      Math.min(
                          anchorDay, YearMonth.from(firstDue).plusMonths(index).lengthOfMonth()));
      installments.add(new Installment(index + 1, BigDecimal.valueOf(parts[index], 2), due));
    }
    return installments;
  }
}
