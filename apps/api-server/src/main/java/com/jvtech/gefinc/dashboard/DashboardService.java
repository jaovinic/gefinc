package com.jvtech.gefinc.dashboard;

import com.jvtech.gefinc.account.Account;
import com.jvtech.gefinc.account.AccountRepository;
import com.jvtech.gefinc.account.AccountType;
import com.jvtech.gefinc.category.Category;
import com.jvtech.gefinc.category.CategoryRepository;
import com.jvtech.gefinc.category.CategoryType;
import com.jvtech.gefinc.invoice.InvoiceBalanceGuard;
import com.jvtech.gefinc.invoice.InvoicePaymentRepository;
import com.jvtech.gefinc.transaction.IncomeSettlement;
import com.jvtech.gefinc.transaction.TransactionRepository;
import com.jvtech.gefinc.transaction.TransactionStatus;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Painel do mês, sempre por mês de vencimento (FR-029 e FR-030). Os totais de despesa e os gráficos
 * consideram só despesas; as receitas entram à parte, em {@code totalIncome} e {@code
 * totalReceived}.
 *
 * <ul>
 *   <li><b>Total do Mês</b>: despesas com vencimento no mês.
 *   <li><b>Total Pago</b>: itens pagos individualmente mais pagamentos das faturas que vencem no
 *       mês; itens quitados por pagamento de fatura não entram de novo.
 *   <li><b>Total a Vencer</b>: restante das faturas de cartão e despesas pendentes de outras contas
 *       com vencimento de hoje em diante; <b>Atrasado</b>: o mesmo com vencimento anterior a hoje.
 *   <li><b>Receitas</b>: total com vencimento no mês e quanto já entrou na conta (receita com
 *       vencimento até hoje entra automaticamente). O saldo das contas fica em {@code GET
 *       /balances}.
 * </ul>
 */
@Service
public class DashboardService {

  public record CategoryAmount(long categoryId, String name, String colorHex, BigDecimal amount) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "CategoryAmount[REDACTED]";
    }
  }

  public record CardAmount(long accountId, String name, BigDecimal amount) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "CardAmount[REDACTED]";
    }
  }

  public record Dashboard(
      YearMonth month,
      BigDecimal totalMonth,
      BigDecimal totalToDue,
      BigDecimal totalPaid,
      BigDecimal overdueTotal,
      BigDecimal totalIncome,
      BigDecimal totalReceived,
      List<CategoryAmount> byCategory,
      List<CardAmount> byCard) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "Dashboard[REDACTED]";
    }
  }

  @PersistenceContext private EntityManager em;

  private final AccountRepository accounts;
  private final CategoryRepository categories;
  private final TransactionRepository transactions;
  private final InvoicePaymentRepository payments;
  private final InvoiceBalanceGuard guard;
  private final Clock clock;
  private final IncomeSettlement incomeSettlement;

  DashboardService(
      AccountRepository accounts,
      CategoryRepository categories,
      TransactionRepository transactions,
      InvoicePaymentRepository payments,
      InvoiceBalanceGuard guard,
      Clock clock,
      IncomeSettlement incomeSettlement) {
    this.accounts = accounts;
    this.categories = categories;
    this.transactions = transactions;
    this.payments = payments;
    this.guard = guard;
    this.clock = clock;
    this.incomeSettlement = incomeSettlement;
  }

  @Transactional
  public Dashboard dashboard(long userId, YearMonth month) {
    incomeSettlement.settleDue(userId);
    LocalDate first = month.atDay(1);
    LocalDate today = LocalDate.now(clock);
    Map<Long, Account> accountsById =
        accounts.findAllOfUser(userId).stream()
            .collect(Collectors.toMap(Account::getId, Function.identity()));
    Map<Long, Category> categoriesById =
        categories.findAllOfUser(userId).stream()
            .collect(Collectors.toMap(Category::getId, Function.identity()));

    BigDecimal totalMonth = BigDecimal.ZERO;
    BigDecimal totalPaid = BigDecimal.ZERO;
    BigDecimal toDue = BigDecimal.ZERO;
    BigDecimal overdue = BigDecimal.ZERO;
    Map<Long, BigDecimal> byCategory = new HashMap<>();
    Map<Long, BigDecimal> byCard = new HashMap<>();

    for (Object[] row : expenseRows(userId, first)) {
      long accountId = (Long) row[0];
      long categoryId = (Long) row[1];
      TransactionStatus status = (TransactionStatus) row[2];
      LocalDate dueDate = (LocalDate) row[3];
      BigDecimal sum = (BigDecimal) row[4];
      boolean settledByInvoice = (Boolean) row[5];
      Account account = accountsById.get(accountId);

      totalMonth = totalMonth.add(sum);
      byCategory.merge(categoryId, sum, BigDecimal::add);
      if (account.isCreditCard()) {
        byCard.merge(accountId, sum, BigDecimal::add);
      }
      if (status == TransactionStatus.PAID && !settledByInvoice) {
        totalPaid = totalPaid.add(sum);
      } else if (status == TransactionStatus.PENDING && !account.isCreditCard()) {
        if (dueDate.isBefore(today)) {
          overdue = overdue.add(sum);
        } else {
          toDue = toDue.add(sum);
        }
      }
    }

    // Faturas de cartão: o restante (já descontados itens pagos e pagamentos) vai para "a vencer"
    // ou "atrasado".
    List<Long> cardIds = new ArrayList<>(byCard.keySet());
    if (!cardIds.isEmpty()) {
      for (Long cardId : cardIds) {
        BigDecimal remaining = guard.amounts(userId, cardId, first).remaining();
        LocalDate due = transactions.invoiceLatestDueDate(userId, cardId, first);
        if (remaining.signum() > 0 && due != null) {
          if (due.isBefore(today)) {
            overdue = overdue.add(remaining);
          } else {
            toDue = toDue.add(remaining);
          }
        }
      }
    }
    List<Long> allCardIds =
        accountsById.values().stream().filter(Account::isCreditCard).map(Account::getId).toList();
    if (!allCardIds.isEmpty()) {
      for (Object[] row : payments.sumsByMonth(userId, allCardIds, first, first)) {
        totalPaid = totalPaid.add((BigDecimal) row[2]);
      }
    }

    // Mesma regra de /balances: só receita em conta (não cartão); recebida = paga até hoje.
    BigDecimal totalIncome = BigDecimal.ZERO;
    BigDecimal totalReceived = BigDecimal.ZERO;
    for (Object[] row : incomeRows(userId, first, today)) {
      totalIncome = totalIncome.add((BigDecimal) row[0]);
      totalReceived = totalReceived.add((BigDecimal) row[1]);
    }

    List<CategoryAmount> categoryList =
        byCategory.entrySet().stream()
            .map(
                e -> {
                  Category c = categoriesById.get(e.getKey());
                  return new CategoryAmount(
                      c.getId(), c.getName(), c.getColorHex(), scale(e.getValue()));
                })
            .sorted(
                Comparator.comparing(CategoryAmount::amount)
                    .reversed()
                    .thenComparing(CategoryAmount::name))
            .toList();
    List<CardAmount> cardList =
        byCard.entrySet().stream()
            .map(
                e ->
                    new CardAmount(
                        e.getKey(), accountsById.get(e.getKey()).getName(), scale(e.getValue())))
            .sorted(
                Comparator.comparing(CardAmount::amount).reversed().thenComparing(CardAmount::name))
            .toList();
    return new Dashboard(
        month,
        scale(totalMonth),
        scale(toDue),
        scale(totalPaid),
        scale(overdue),
        scale(totalIncome),
        scale(totalReceived),
        categoryList,
        cardList);
  }

  /**
   * Despesas do mês agrupadas por conta, categoria, status, vencimento e se foram quitadas pela
   * fatura.
   */
  private List<Object[]> expenseRows(long userId, LocalDate month) {
    return em.createQuery(
            "select t.accountId, t.categoryId, t.status, t.dueDate, sum(t.amount),"
                + " case when t.settledByPaymentId is null then false else true end"
                + " from Transaction t, Category c where c.id = t.categoryId and c.userId = t.userId"
                + " and c.type = :expense and t.userId = :userId and t.referenceMonth = :month"
                + " group by t.accountId, t.categoryId, t.status, t.dueDate,"
                + " case when t.settledByPaymentId is null then false else true end",
            Object[].class)
        .setParameter("expense", CategoryType.EXPENSE)
        .setParameter("userId", userId)
        .setParameter("month", month)
        .getResultList();
  }

  /**
   * Receitas do mês em contas que não são cartão: linha {@code [total, recebidoAteHoje]}. Receita
   * legada em cartão é ignorada.
   */
  private List<Object[]> incomeRows(long userId, LocalDate month, LocalDate today) {
    return em.createQuery(
            "select coalesce(sum(t.amount), 0),"
                + " coalesce(sum(case when t.status = :paid and t.paymentDate <= :today"
                + " then t.amount else 0 end), 0)"
                + " from Transaction t, Category c, Account a"
                + " where c.id = t.categoryId and c.userId = t.userId"
                + " and a.id = t.accountId and a.userId = t.userId"
                + " and a.type <> :card"
                + " and c.type = :income and t.userId = :userId and t.referenceMonth = :month",
            Object[].class)
        .setParameter("paid", TransactionStatus.PAID)
        .setParameter("today", today)
        .setParameter("card", AccountType.CREDIT_CARD)
        .setParameter("income", CategoryType.INCOME)
        .setParameter("userId", userId)
        .setParameter("month", month)
        .getResultList();
  }

  private static BigDecimal scale(BigDecimal value) {
    return value.setScale(2, java.math.RoundingMode.UNNECESSARY);
  }
}
