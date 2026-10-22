package com.jvtech.gefinc.transaction;

import com.jvtech.gefinc.account.Account;
import java.time.LocalDate;
import java.time.YearMonth;

/**
 * Calendário das ocorrências de um lançamento fixo. No cartão, cada mês é tratado como uma compra
 * no dia da data de compra original e o vencimento vem da fatura (FR-021); nas demais contas, o
 * vencimento repete o dia do primeiro vencimento, limitado ao último dia de cada mês.
 */
final class FixedSchedule {

  private FixedSchedule() {}

  /** Vencimento da ocorrência de índice {@code index} (0 = primeira). */
  static LocalDate dueDate(Account account, TransactionGroup group, int index) {
    if (account.isCreditCard()) {
      YearMonth month = YearMonth.from(group.getPurchaseDate()).plusMonths(index);
      return DueDateCalculator.fixedOccurrenceDueDate(
          group.getPurchaseDate(),
          month.getYear(),
          month.getMonthValue(),
          account.getClosingDay(),
          account.getDueDay());
    }
    YearMonth month = YearMonth.from(group.getFirstDueDate()).plusMonths(index);
    return month.atDay(Math.min(group.getFirstDueDate().getDayOfMonth(), month.lengthOfMonth()));
  }
}
