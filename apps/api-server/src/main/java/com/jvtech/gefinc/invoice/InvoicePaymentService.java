package com.jvtech.gefinc.invoice;

import com.jvtech.gefinc.account.Account;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.invoice.InvoiceDtos.InvoiceResponse;
import com.jvtech.gefinc.transaction.TransactionRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Pagamentos de fatura (FR-034 a FR-038). Toda operação trava a linha da conta, de modo que
 * pagamentos simultâneos nunca ultrapassem o restante.
 */
@Service
public class InvoicePaymentService {

  private final InvoiceService invoices;
  private final InvoiceBalanceGuard guard;
  private final InvoicePaymentRepository payments;
  private final TransactionRepository transactions;
  private final Clock clock;

  InvoicePaymentService(
      InvoiceService invoices,
      InvoiceBalanceGuard guard,
      InvoicePaymentRepository payments,
      TransactionRepository transactions,
      Clock clock) {
    this.invoices = invoices;
    this.guard = guard;
    this.payments = payments;
    this.transactions = transactions;
    this.clock = clock;
  }

  /**
   * Registra um pagamento total ou parcial. Pagamento parcial não altera o status dos itens; quando
   * o restante chega a zero, os itens pendentes são quitados (FR-035).
   */
  @Transactional
  public InvoiceResponse pay(
      long userId, long accountId, YearMonth month, BigDecimal amount, LocalDate paidAt) {
    Account card = lockedCard(userId, accountId);
    LocalDate first = month.atDay(1);
    if (transactions.invoiceItemCount(userId, accountId, first) == 0) {
      throw ApiException.notFound("Fatura não encontrada.");
    }
    InvoiceCalculator.Amounts before = guard.amounts(userId, accountId, first);
    if (!before.accepts(amount)) {
      throw new ApiException(
              ErrorCode.INVOICE_BALANCE_VIOLATION,
              "O pagamento não pode ser maior que o saldo restante da fatura (R$ "
                  + before.remaining().toPlainString()
                  + ").")
          .with("remainingBalance", before.remaining());
    }
    InvoicePayment payment =
        payments.saveAndFlush(
            new InvoicePayment(userId, accountId, first, amount, paidAt, clock.instant()));
    if (guard.amounts(userId, accountId, first).remaining().signum() == 0) {
      transactions.settlePendingOfInvoice(userId, accountId, first, payment.getId(), paidAt);
    }
    return invoices.build(userId, card, month);
  }

  /** Paga a fatura pelo saldo restante total (FR-036). */
  @Transactional
  public InvoiceResponse settle(long userId, long accountId, YearMonth month, LocalDate paidAt) {
    lockedCard(userId, accountId);
    LocalDate first = month.atDay(1);
    if (transactions.invoiceItemCount(userId, accountId, first) == 0) {
      throw ApiException.notFound("Fatura não encontrada.");
    }
    BigDecimal remaining = guard.amounts(userId, accountId, first).remaining();
    if (remaining.signum() <= 0) {
      throw new ApiException(ErrorCode.CONFLICT, "Esta fatura já está quitada.");
    }
    return pay(userId, accountId, month, remaining, paidAt);
  }

  /**
   * Desfaz um pagamento. Os itens que haviam sido quitados automaticamente voltam a pendentes; os
   * pagos individualmente pelo usuário permanecem pagos (FR-036).
   */
  @Transactional
  public InvoiceResponse undo(long userId, long paymentId) {
    InvoicePayment payment =
        payments
            .findByIdAndUserId(paymentId, userId)
            .orElseThrow(() -> ApiException.notFound("Pagamento não encontrado."));
    Account card = lockedCard(userId, payment.getAccountId());
    LocalDate first = payment.getInvoiceMonth();
    transactions.revertSettledOfInvoice(userId, card.getId(), first);
    payments.delete(payment);
    payments.flush();
    return invoices.build(userId, card, YearMonth.from(first));
  }

  private Account lockedCard(long userId, long accountId) {
    invoices.card(userId, accountId); // 404 se não for um cartão do usuário
    return guard
        .lockIfCard(userId, accountId)
        .orElseThrow(() -> ApiException.notFound("Cartão não encontrado."));
  }
}
