package com.jvtech.gefinc.invoice;

import com.jvtech.gefinc.account.Account;
import com.jvtech.gefinc.account.AccountRepository;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.invoice.InvoiceDtos.CardProjection;
import com.jvtech.gefinc.invoice.InvoiceDtos.InvoiceResponse;
import com.jvtech.gefinc.invoice.InvoiceDtos.MonthTotals;
import com.jvtech.gefinc.invoice.InvoiceDtos.PaymentResponse;
import com.jvtech.gefinc.invoice.InvoiceDtos.ProjectionResponse;
import com.jvtech.gefinc.transaction.Transaction;
import com.jvtech.gefinc.transaction.TransactionGroup;
import com.jvtech.gefinc.transaction.TransactionGroupRepository;
import com.jvtech.gefinc.transaction.TransactionMapper;
import com.jvtech.gefinc.transaction.TransactionRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Faturas de cartão como visão derivada: os itens são as ocorrências da conta no mês de referência
 * (mês do vencimento); só os pagamentos de fatura são persistidos.
 */
@Service
public class InvoiceService {

  static final int MAX_PROJECTION_MONTHS = 24;

  private final AccountRepository accounts;
  private final TransactionRepository transactions;
  private final TransactionGroupRepository groups;
  private final InvoicePaymentRepository payments;
  private final InvoiceBalanceGuard guard;
  private final TransactionMapper mapper;

  InvoiceService(
      AccountRepository accounts,
      TransactionRepository transactions,
      TransactionGroupRepository groups,
      InvoicePaymentRepository payments,
      InvoiceBalanceGuard guard,
      TransactionMapper mapper) {
    this.accounts = accounts;
    this.transactions = transactions;
    this.groups = groups;
    this.payments = payments;
    this.guard = guard;
    this.mapper = mapper;
  }

  @Transactional(readOnly = true)
  public InvoiceResponse invoice(long userId, long accountId, YearMonth month) {
    return build(userId, card(userId, accountId), month);
  }

  /** Cartão do usuário; qualquer outra conta (ou conta de outro usuário) é "não encontrada". */
  Account card(long userId, long accountId) {
    return accounts
        .findByIdAndUserId(accountId, userId)
        .filter(Account::isCreditCard)
        .orElseThrow(() -> ApiException.notFound("Cartão não encontrado."));
  }

  InvoiceResponse build(long userId, Account card, YearMonth month) {
    LocalDate first = month.atDay(1);
    List<Transaction> items =
        transactions.findByUserIdAndAccountIdAndReferenceMonthOrderByDueDateAscIdAsc(
            userId, card.getId(), first);
    Map<Long, TransactionGroup> groupsById =
        groups.findAllById(items.stream().map(Transaction::getGroupId).distinct().toList()).stream()
            .collect(Collectors.toMap(TransactionGroup::getId, g -> g));
    InvoiceCalculator.Amounts amounts = guard.amounts(userId, card.getId(), first);
    LocalDate latestDue = transactions.invoiceLatestDueDate(userId, card.getId(), first);
    LocalDate dueDate =
        latestDue != null
            ? latestDue
            : month.atDay(Math.min(card.getDueDay(), month.lengthOfMonth()));
    return new InvoiceResponse(
        card.getId(),
        month,
        dueDate,
        amounts.total(),
        amounts.paidIndividually(),
        amounts.paidByInvoicePayments(),
        amounts.remaining(),
        items.stream().map(t -> mapper.toResponse(t, groupsById.get(t.getGroupId()))).toList(),
        payments
            .findByUserIdAndAccountIdAndInvoiceMonthOrderByIdAsc(userId, card.getId(), first)
            .stream()
            .map(p -> new PaymentResponse(p.getId(), p.getAmount(), p.getPaidAt()))
            .toList());
  }

  /**
   * Projeção de faturas por cartão e mês (total e restante), com os meses sem lançamentos zerados.
   */
  @Transactional(readOnly = true)
  public ProjectionResponse projection(long userId, YearMonth from, int months, Long accountId) {
    if (months < 1 || months > MAX_PROJECTION_MONTHS) {
      throw new ApiException(
          ErrorCode.BAD_REQUEST,
          "A quantidade de meses deve estar entre 1 e " + MAX_PROJECTION_MONTHS + ".");
    }
    List<YearMonth> range = new ArrayList<>();
    for (int i = 0; i < months; i++) {
      range.add(from.plusMonths(i));
    }
    List<Account> cards =
        accountId != null
            ? List.of(card(userId, accountId))
            : accounts.findAllOfUser(userId).stream().filter(Account::isCreditCard).toList();
    if (cards.isEmpty()) {
      return new ProjectionResponse(range, List.of());
    }
    List<Long> ids = cards.stream().map(Account::getId).toList();
    LocalDate firstDay = from.atDay(1);
    LocalDate lastDay = range.get(range.size() - 1).atDay(1);

    Map<String, BigDecimal[]> totals = new HashMap<>(); // [total, pagoIndividualmente]
    for (Object[] row : transactions.invoiceTotalsByMonth(userId, ids, firstDay, lastDay)) {
      totals.put(
          key((Long) row[0], (LocalDate) row[1]),
          new BigDecimal[] {(BigDecimal) row[2], (BigDecimal) row[3]});
    }
    Map<String, BigDecimal> paid = new HashMap<>();
    for (Object[] row : payments.sumsByMonth(userId, ids, firstDay, lastDay)) {
      paid.put(key((Long) row[0], (LocalDate) row[1]), (BigDecimal) row[2]);
    }

    List<CardProjection> result = new ArrayList<>();
    for (Account card : cards) {
      List<MonthTotals> invoices = new ArrayList<>();
      BigDecimal committed = BigDecimal.ZERO;
      for (YearMonth month : range) {
        String key = key(card.getId(), month.atDay(1));
        BigDecimal[] t =
            totals.getOrDefault(key, new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO});
        BigDecimal remaining =
            new InvoiceCalculator.Amounts(t[0], t[1], paid.getOrDefault(key, BigDecimal.ZERO))
                .remaining();
        invoices.add(new MonthTotals(month, scale(t[0]), scale(remaining)));
        committed = committed.add(remaining);
      }
      result.add(new CardProjection(card.getId(), card.getName(), scale(committed), invoices));
    }
    return new ProjectionResponse(range, result);
  }

  private static String key(long accountId, LocalDate month) {
    return accountId + "|" + month;
  }

  private static BigDecimal scale(BigDecimal value) {
    return value.setScale(2, java.math.RoundingMode.UNNECESSARY);
  }
}
