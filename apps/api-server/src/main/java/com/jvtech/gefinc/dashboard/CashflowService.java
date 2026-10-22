package com.jvtech.gefinc.dashboard;

import com.jvtech.gefinc.category.CategoryType;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Saldo residual de cada mês: receitas previstas menos despesas previstas, por mês de vencimento e
 * independentemente do status (FR-028).
 */
@Service
public class CashflowService {

  static final int MAX_MONTHS = 24;

  public record Month(
      YearMonth month,
      BigDecimal expectedIncome,
      BigDecimal expectedExpense,
      BigDecimal residual) {}

  @PersistenceContext private EntityManager em;

  @Transactional(readOnly = true)
  public List<Month> cashflow(long userId, YearMonth from, int months) {
    if (months < 1 || months > MAX_MONTHS) {
      throw new ApiException(
          ErrorCode.BAD_REQUEST, "A quantidade de meses deve estar entre 1 e " + MAX_MONTHS + ".");
    }
    LocalDate first = from.atDay(1);
    LocalDate last = from.plusMonths(months - 1L).atDay(1);
    List<?> rows =
        em.createQuery(
                "select t.referenceMonth, c.type, sum(t.amount) from Transaction t, Category c"
                    + " where c.id = t.categoryId and c.userId = t.userId and t.userId = :userId"
                    + " and t.referenceMonth between :from and :to group by t.referenceMonth, c.type")
            .setParameter("userId", userId)
            .setParameter("from", first)
            .setParameter("to", last)
            .getResultList();
    Map<String, BigDecimal> sums = new HashMap<>();
    for (Object row : rows) {
      Object[] r = (Object[]) row;
      sums.put(r[0] + "|" + r[1], (BigDecimal) r[2]);
    }
    List<Month> result = new ArrayList<>();
    for (int i = 0; i < months; i++) {
      YearMonth month = from.plusMonths(i);
      BigDecimal income =
          sums.getOrDefault(month.atDay(1) + "|" + CategoryType.INCOME, BigDecimal.ZERO);
      BigDecimal expense =
          sums.getOrDefault(month.atDay(1) + "|" + CategoryType.EXPENSE, BigDecimal.ZERO);
      result.add(
          new Month(
              month,
              income.setScale(2),
              expense.setScale(2),
              income.subtract(expense).setScale(2)));
    }
    return result;
  }
}
