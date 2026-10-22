package com.jvtech.gefinc.transaction;

import com.jvtech.gefinc.account.AccountRepository;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.invoice.InvoiceBalanceGuard;
import com.jvtech.gefinc.transaction.TransactionDtos.Patch;
import com.jvtech.gefinc.transaction.TransactionDtos.TransactionPage;
import com.jvtech.gefinc.transaction.TransactionDtos.TransactionResponse;
import java.time.LocalDate;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Consulta, edição, pagamento e estorno de ocorrências individuais. */
@Service
public class TransactionService {

  private static final int MAX_PAGE_SIZE = 200;

  private final TransactionRepository transactions;
  private final TransactionGroupRepository groups;
  private final AccountRepository accounts;
  private final TransactionSearch search;
  private final TransactionMapper mapper;
  private final InvoiceBalanceGuard guard;

  TransactionService(
      TransactionRepository transactions,
      TransactionGroupRepository groups,
      AccountRepository accounts,
      TransactionSearch search,
      TransactionMapper mapper,
      InvoiceBalanceGuard guard) {
    this.transactions = transactions;
    this.groups = groups;
    this.accounts = accounts;
    this.search = search;
    this.mapper = mapper;
    this.guard = guard;
  }

  @Transactional(readOnly = true)
  public TransactionPage list(long userId, TransactionSearch.Filter filter, int page, int size) {
    if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
      throw new ApiException(ErrorCode.BAD_REQUEST, "Paginação inválida.");
    }
    TransactionSearch.Result result = search.search(userId, filter, page, size);
    return new TransactionPage(
        result.rows().stream().map(r -> mapper.toResponse(r.transaction(), r.group())).toList(),
        page,
        size,
        result.total());
  }

  @Transactional(readOnly = true)
  public TransactionResponse get(long userId, long id) {
    Transaction tx = load(userId, id);
    return mapper.toResponse(tx, group(tx));
  }

  @Transactional
  public TransactionResponse patch(long userId, long id, Patch patch) {
    Transaction tx = load(userId, id);
    boolean card = guard.lockIfCard(userId, tx.getAccountId()).isPresent();
    checkVersion(tx, patch.version());
    if (tx.isPaid()) {
      throw new ApiException(
          ErrorCode.CONFLICT,
          "Ocorrências já pagas não podem ser editadas. Desfaça o pagamento antes.");
    }
    if (patch.amount() == null && patch.dueDate() == null) {
      throw ApiException.validation("Informe o valor ou o vencimento.");
    }
    if (patch.dueDate() != null && !patch.dueDate().equals(tx.getDueDate())) {
      if (card) {
        throw ApiException.validation("Há campos inválidos.")
            .withFieldError(
                "dueDate", "O vencimento de lançamentos no cartão é definido pela fatura.");
      }
      tx.reschedule(patch.dueDate());
    }
    if (patch.amount() != null) {
      tx.setAmount(patch.amount());
    }
    try {
      transactions.saveAndFlush(tx);
    } catch (DataIntegrityViolationException e) {
      throw new ApiException(
          ErrorCode.CONFLICT, "Já existe uma ocorrência deste lançamento no mês escolhido.");
    }
    if (card) {
      guard.assertNotOverpaid(userId, tx.getAccountId(), List.of(tx.getReferenceMonth()));
    }
    return mapper.toResponse(tx, group(tx));
  }

  @Transactional
  public TransactionResponse pay(long userId, long id, LocalDate paymentDate) {
    Transaction tx = load(userId, id);
    boolean card = guard.lockIfCard(userId, tx.getAccountId()).isPresent();
    if (tx.isPaid()) {
      throw new ApiException(ErrorCode.CONFLICT, "Este lançamento já está pago.");
    }
    tx.markPaid(paymentDate);
    transactions.saveAndFlush(tx);
    if (card) {
      guard.assertNotOverpaid(userId, tx.getAccountId(), List.of(tx.getReferenceMonth()));
    }
    return mapper.toResponse(tx, group(tx));
  }

  @Transactional
  public TransactionResponse unpay(long userId, long id) {
    Transaction tx = load(userId, id);
    if (!tx.isPaid()) {
      throw new ApiException(ErrorCode.CONFLICT, "Este lançamento não está pago.");
    }
    if (tx.getSettledByPaymentId() != null) {
      throw new ApiException(
          ErrorCode.CONFLICT,
          "Este item foi quitado por um pagamento de fatura. Desfaça o pagamento da fatura para reabri-lo.");
    }
    guard.lockIfCard(userId, tx.getAccountId());
    tx.markPending();
    transactions.saveAndFlush(tx);
    return mapper.toResponse(tx, group(tx));
  }

  private Transaction load(long userId, long id) {
    return transactions
        .findByIdAndUserId(id, userId)
        .orElseThrow(() -> ApiException.notFound("Lançamento não encontrado."));
  }

  private TransactionGroup group(Transaction tx) {
    return groups.findByIdAndUserId(tx.getGroupId(), tx.getUserId()).orElseThrow();
  }

  private static void checkVersion(Transaction tx, long version) {
    if (tx.getVersion() != version) {
      throw new ApiException(
          ErrorCode.STALE_VERSION,
          "O lançamento foi alterado em outro lugar. Recarregue e tente novamente.");
    }
  }
}
