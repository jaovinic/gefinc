package com.jvtech.gefinc.transaction;

import com.jvtech.gefinc.account.Account;
import com.jvtech.gefinc.account.AccountRepository;
import com.jvtech.gefinc.account.CardDaysChangedEvent;
import com.jvtech.gefinc.invoice.InvoiceBalanceGuard;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Quando os dias do cartão mudam (FR-014), recalcula o vencimento das ocorrências de lançamentos
 * fixos que estão pendentes e com vencimento posterior a hoje. Parcelas, avulsos e ocorrências
 * pagas mantêm a data. Roda na mesma transação da alteração do cartão.
 */
@Component
class FixedDueDateRecalculationListener {

  private final AccountRepository accounts;
  private final TransactionGroupRepository groups;
  private final TransactionRepository transactions;
  private final Clock clock;
  private final InvoiceBalanceGuard guard;

  FixedDueDateRecalculationListener(
      AccountRepository accounts,
      TransactionGroupRepository groups,
      TransactionRepository transactions,
      Clock clock,
      InvoiceBalanceGuard guard) {
    this.accounts = accounts;
    this.groups = groups;
    this.transactions = transactions;
    this.clock = clock;
    this.guard = guard;
  }

  @EventListener
  void onCardDaysChanged(CardDaysChangedEvent event) {
    Account account = accounts.findByIdAndUserId(event.accountId(), event.userId()).orElse(null);
    if (account == null || !account.isCreditCard()) {
      return;
    }
    LocalDate today = LocalDate.now(clock);
    for (TransactionGroup group : groups.findFixedOfAccount(event.userId(), event.accountId())) {
      recalculate(group, account, today);
    }
    transactions.flush();
  }

  private void recalculate(TransactionGroup group, Account account, LocalDate today) {
    List<Transaction> all =
        transactions.findByGroupIdAndUserIdOrderByInstallmentNumber(
            group.getId(), group.getUserId());
    // Meses que ficam como estão: ocorrências pagas ou com vencimento já passado ou de hoje.
    Set<YearMonth> occupied = new HashSet<>();
    List<Transaction> candidates = new java.util.ArrayList<>();
    for (Transaction tx : all) {
      if (!tx.isPaid() && tx.getDueDate().isAfter(today)) {
        candidates.add(tx);
      } else {
        occupied.add(YearMonth.from(tx.getReferenceMonth()));
      }
    }
    for (Transaction tx : candidates) {
      LocalDate newDue = FixedSchedule.dueDate(account, group, tx.getInstallmentNumber() - 1);
      YearMonth newMonth = YearMonth.from(newDue);
      // Só recalcula se a nova data também é futura, não colide com um mês que fica como está e
      // nenhuma das duas faturas (de origem e de destino) tem pagamento registrado (FR-014).
      boolean paymentsInvolved =
          guard.hasPayments(group.getUserId(), account.getId(), tx.getReferenceMonth())
              || guard.hasPayments(group.getUserId(), account.getId(), newMonth.atDay(1));
      if (newDue.isAfter(today) && !occupied.contains(newMonth) && !paymentsInvolved) {
        tx.reschedule(newDue);
        occupied.add(newMonth);
      } else {
        occupied.add(YearMonth.from(tx.getReferenceMonth()));
      }
    }
  }
}
