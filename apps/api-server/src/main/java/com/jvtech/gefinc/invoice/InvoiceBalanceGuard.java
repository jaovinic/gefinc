package com.jvtech.gefinc.invoice;

import com.jvtech.gefinc.account.Account;
import com.jvtech.gefinc.account.AccountRepository;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.transaction.TransactionRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Garante que o restante de uma fatura nunca fique negativo (FR-038). As operações que mexem nos
 * itens de um cartão travam a linha da conta, aplicam a mudança e então confirmam o saldo; se ele
 * ficou negativo, a exceção desfaz a transação inteira.
 */
@Component
public class InvoiceBalanceGuard {

  private final AccountRepository accounts;
  private final TransactionRepository transactions;
  private final InvoicePaymentRepository payments;

  InvoiceBalanceGuard(
      AccountRepository accounts,
      TransactionRepository transactions,
      InvoicePaymentRepository payments) {
    this.accounts = accounts;
    this.transactions = transactions;
    this.payments = payments;
  }

  /** Trava a conta se for cartão de crédito; devolve vazio para as demais contas. */
  public Optional<Account> lockIfCard(long userId, long accountId) {
    return accounts.findForUpdate(accountId, userId).filter(Account::isCreditCard);
  }

  /** Valores da fatura (conta e mês de referência) a partir do estado atual do banco. */
  public InvoiceCalculator.Amounts amounts(long userId, long accountId, LocalDate month) {
    return new InvoiceCalculator.Amounts(
        transactions.invoiceTotal(userId, accountId, month),
        transactions.invoicePaidIndividually(userId, accountId, month),
        payments.sumOf(userId, accountId, month));
  }

  /** Recusa (409) se alguma das faturas ficou com o restante negativo depois da mudança. */
  public void assertNotOverpaid(long userId, long accountId, Collection<LocalDate> months) {
    transactions.flush();
    for (LocalDate month : months) {
      InvoiceCalculator.Amounts amounts = amounts(userId, accountId, month);
      if (amounts.isOverpaid()) {
        BigDecimal excess = amounts.remaining().negate();
        throw new ApiException(
            ErrorCode.INVOICE_BALANCE_VIOLATION,
            "A operação deixaria a fatura de "
                + month.toString().substring(0, 7)
                + " com pagamentos acima do total (R$ "
                + excess
                + " a mais). Desfaça pagamentos da fatura antes.");
      }
    }
  }

  /**
   * Há pagamento registrado na fatura (conta e mês)? Usado para não mover lançamentos entre
   * faturas.
   */
  public boolean hasPayments(long userId, long accountId, LocalDate month) {
    return payments.existsByUserIdAndAccountIdAndInvoiceMonth(userId, accountId, month);
  }
}
