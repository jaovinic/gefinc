package com.jvtech.gefinc.dashboard;

import com.jvtech.gefinc.account.AccountType;
import com.jvtech.gefinc.category.CategoryType;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.invoice.InvoiceBalanceGuard;
import com.jvtech.gefinc.transaction.TransactionRepository;
import com.jvtech.gefinc.transaction.TransactionStatus;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Contagem de vencimentos para os lembretes do app, pelas mesmas regras do painel: despesas
 * pendentes fora de cartão contam item a item; cartão conta uma vez por fatura com saldo restante,
 * na data de vencimento da fatura; "atrasado" é tudo isso com vencimento anterior a hoje. Nunca
 * devolve valores, descrições nem nomes (a contagem basta aos lembretes).
 */
@Service
public class DueSummaryService {

  /** Maior período aceito (dias), para limitar o custo da consulta. */
  static final int MAX_DAYS = 62;

  public record Day(LocalDate date, int items, int invoices) {}

  public record Overdue(int items, int invoices) {}

  public record DueSummary(List<Day> days, Overdue overdue) {
    /** Sem dados do usuário em logs (FR-003). */
    @Override
    public String toString() {
      return "DueSummary[REDACTED]";
    }
  }

  @PersistenceContext private EntityManager em;

  private final TransactionRepository transactions;
  private final InvoiceBalanceGuard guard;
  private final Clock clock;

  DueSummaryService(TransactionRepository transactions, InvoiceBalanceGuard guard, Clock clock) {
    this.transactions = transactions;
    this.guard = guard;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public DueSummary summary(long userId, LocalDate from, LocalDate to) {
    if (to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > MAX_DAYS) {
      throw new ApiException(
          ErrorCode.BAD_REQUEST,
          "Informe um período válido de até " + MAX_DAYS + " dias (from <= to).");
    }
    LocalDate today = LocalDate.now(clock);
    Map<LocalDate, int[]> days = new TreeMap<>(); // [itens, faturas]
    int overdueItems = 0;
    int overdueInvoices = 0;

    // Despesas pendentes fora de cartão: uma contagem por data de vencimento.
    for (Object[] row : plainRows(userId, from, to, today)) {
      LocalDate due = (LocalDate) row[0];
      int count = ((Long) row[1]).intValue();
      if (due.isBefore(today)) {
        overdueItems += count;
      }
      if (!due.isBefore(from) && !due.isAfter(to)) {
        days.computeIfAbsent(due, d -> new int[2])[0] += count;
      }
    }

    // Cartão: uma contagem por fatura (cartão e mês) com saldo restante.
    for (Object[] row : cardInvoices(userId, to.withDayOfMonth(1))) {
      long accountId = (Long) row[0];
      LocalDate month = (LocalDate) row[1];
      LocalDate due = transactions.invoiceLatestDueDate(userId, accountId, month);
      if (due == null || guard.amounts(userId, accountId, month).remaining().signum() <= 0) {
        continue;
      }
      if (due.isBefore(today)) {
        overdueInvoices++;
      }
      if (!due.isBefore(from) && !due.isAfter(to)) {
        days.computeIfAbsent(due, d -> new int[2])[1]++;
      }
    }

    List<Day> list =
        days.entrySet().stream()
            .map(e -> new Day(e.getKey(), e.getValue()[0], e.getValue()[1]))
            .toList();
    return new DueSummary(list, new Overdue(overdueItems, overdueInvoices));
  }

  /** Despesas pendentes de contas que não são cartão, vencidas ou vencendo até o fim do período. */
  private List<Object[]> plainRows(long userId, LocalDate from, LocalDate to, LocalDate today) {
    LocalDate lastNeeded = to.isAfter(today) ? to : today;
    return em.createQuery(
            "select t.dueDate, count(t) from Transaction t, Category c, Account a"
                + " where c.id = t.categoryId and c.userId = t.userId"
                + " and a.id = t.accountId and a.userId = t.userId"
                + " and t.userId = :userId and c.type = :expense and t.status = :pending"
                + " and a.type <> :card and t.dueDate <= :last"
                + " group by t.dueDate",
            Object[].class)
        .setParameter("userId", userId)
        .setParameter("expense", CategoryType.EXPENSE)
        .setParameter("pending", TransactionStatus.PENDING)
        .setParameter("card", AccountType.CREDIT_CARD)
        .setParameter("last", lastNeeded)
        .getResultList();
  }

  /** Faturas (cartão e mês de referência) com despesas pendentes até o mês final do período. */
  private List<Object[]> cardInvoices(long userId, LocalDate lastMonth) {
    return em.createQuery(
            "select distinct t.accountId, t.referenceMonth from Transaction t, Category c, Account a"
                + " where c.id = t.categoryId and c.userId = t.userId"
                + " and a.id = t.accountId and a.userId = t.userId"
                + " and t.userId = :userId and c.type = :expense and t.status = :pending"
                + " and a.type = :card and t.referenceMonth <= :lastMonth",
            Object[].class)
        .setParameter("userId", userId)
        .setParameter("expense", CategoryType.EXPENSE)
        .setParameter("pending", TransactionStatus.PENDING)
        .setParameter("card", AccountType.CREDIT_CARD)
        .setParameter("lastMonth", lastMonth)
        .getResultList();
  }
}
