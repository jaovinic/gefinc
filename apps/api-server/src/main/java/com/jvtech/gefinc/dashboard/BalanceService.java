package com.jvtech.gefinc.dashboard;

import com.jvtech.gefinc.account.Account;
import com.jvtech.gefinc.account.AccountRepository;
import com.jvtech.gefinc.account.AccountType;
import com.jvtech.gefinc.category.CategoryType;
import com.jvtech.gefinc.invoice.InvoicePaymentRepository;
import com.jvtech.gefinc.transaction.IncomeSettlement;
import com.jvtech.gefinc.transaction.TransactionStatus;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Saldo acumulado até hoje de cada conta bancária e de dinheiro (ativas e inativas): saldo inicial,
 * mais receitas recebidas, menos despesas pagas da própria conta, menos as saídas dos cartões
 * vinculados (despesas de cartão pagas individualmente e pagamentos de fatura). Itens quitados por
 * pagamento de fatura não entram de novo; receita legada em cartão é ignorada. Saídas de cartão sem
 * conta vinculada não debitam conta alguma e aparecem à parte. Todas as contas voltam com o saldo
 * real e a flag {@code active}, mas o total soma apenas as ativas: conta inativa não entra no Saldo
 * Geral, mesmo com saldo.
 */
@Service
public class BalanceService {

  public record AccountBalance(
      long accountId,
      String name,
      AccountType type,
      boolean active,
      BigDecimal balance,
      BigDecimal openingBalance) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "AccountBalance[REDACTED]";
    }
  }

  public record Balances(
      LocalDate asOf,
      BigDecimal total,
      List<AccountBalance> accounts,
      BigDecimal unlinkedCardPayments) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "Balances[REDACTED]";
    }
  }

  @PersistenceContext private EntityManager em;

  private final AccountRepository accounts;
  private final InvoicePaymentRepository payments;
  private final IncomeSettlement incomeSettlement;
  private final Clock clock;

  BalanceService(
      AccountRepository accounts,
      InvoicePaymentRepository payments,
      IncomeSettlement incomeSettlement,
      Clock clock) {
    this.accounts = accounts;
    this.payments = payments;
    this.incomeSettlement = incomeSettlement;
    this.clock = clock;
  }

  @Transactional
  public Balances balances(long userId) {
    incomeSettlement.settleDue(userId);
    LocalDate today = LocalDate.now(clock);
    List<Account> all = accounts.findAllOfUser(userId);
    Map<Long, Account> byId = new HashMap<>();
    all.forEach(a -> byId.put(a.getId(), a));

    Map<Long, BigDecimal> balance = new HashMap<>();
    for (Account a : all) {
      if (!a.isCreditCard()) {
        balance.put(a.getId(), a.getOpeningBalance());
      }
    }
    BigDecimal unlinked = BigDecimal.ZERO;

    for (Object[] row : paidRows(userId, today)) {
      Account account = byId.get((Long) row[0]);
      CategoryType kind = (CategoryType) row[1];
      BigDecimal sum = (BigDecimal) row[2];
      if (account.isCreditCard()) {
        if (kind == CategoryType.EXPENSE) {
          unlinked = debitCard(balance, account, sum, unlinked);
        }
      } else {
        balance.merge(
            account.getId(), kind == CategoryType.INCOME ? sum : sum.negate(), BigDecimal::add);
      }
    }
    for (Object[] row : payments.sumsPaidUntil(userId, today)) {
      Account card = byId.get((Long) row[0]);
      unlinked = debitCard(balance, card, (BigDecimal) row[1], unlinked);
    }

    List<AccountBalance> list =
        all.stream()
            .filter(a -> !a.isCreditCard())
            .map(
                a ->
                    new AccountBalance(
                        a.getId(),
                        a.getName(),
                        a.getType(),
                        a.isActive(),
                        scale(balance.get(a.getId())),
                        scale(a.getOpeningBalance())))
            .toList();
    BigDecimal total =
        list.stream()
            .filter(AccountBalance::active)
            .map(AccountBalance::balance)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    return new Balances(today, scale(total), list, scale(unlinked));
  }

  /** Debita a conta vinculada ao cartão; sem vínculo (ou com vínculo ausente) vai para a parte. */
  private static BigDecimal debitCard(
      Map<Long, BigDecimal> balance, Account card, BigDecimal amount, BigDecimal unlinked) {
    Long bank = card.getBankAccountId();
    if (bank != null && balance.containsKey(bank)) {
      balance.merge(bank, amount.negate(), BigDecimal::add);
      return unlinked;
    }
    return unlinked.add(amount);
  }

  /**
   * Linhas {@code [accountId, tipoDaCategoria, soma]} dos itens pagos até hoje que não foram
   * quitados por pagamento de fatura.
   */
  private List<Object[]> paidRows(long userId, LocalDate today) {
    return em.createQuery(
            "select t.accountId, c.type, sum(t.amount)"
                + " from Transaction t, Category c where c.id = t.categoryId and c.userId = t.userId"
                + " and t.userId = :userId and t.status = :paid and t.settledByPaymentId is null"
                + " and t.paymentDate <= :today group by t.accountId, c.type",
            Object[].class)
        .setParameter("userId", userId)
        .setParameter("paid", TransactionStatus.PAID)
        .setParameter("today", today)
        .getResultList();
  }

  private static BigDecimal scale(BigDecimal value) {
    return value.setScale(2, RoundingMode.UNNECESSARY);
  }
}
