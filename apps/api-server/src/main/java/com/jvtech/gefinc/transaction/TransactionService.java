package com.jvtech.gefinc.transaction;

import com.jvtech.gefinc.account.AccountRepository;
import com.jvtech.gefinc.category.CategoryRepository;
import com.jvtech.gefinc.category.CategoryType;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.invoice.InvoiceBalanceGuard;
import com.jvtech.gefinc.transaction.TransactionDtos.Patch;
import com.jvtech.gefinc.transaction.TransactionDtos.TransactionPage;
import com.jvtech.gefinc.transaction.TransactionDtos.TransactionResponse;
import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
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
  private final CategoryRepository categories;
  private final IncomeSettlement incomeSettlement;
  private final Clock clock;

  TransactionService(
      TransactionRepository transactions,
      TransactionGroupRepository groups,
      AccountRepository accounts,
      TransactionSearch search,
      TransactionMapper mapper,
      InvoiceBalanceGuard guard,
      CategoryRepository categories,
      IncomeSettlement incomeSettlement,
      Clock clock) {
    this.transactions = transactions;
    this.groups = groups;
    this.accounts = accounts;
    this.search = search;
    this.mapper = mapper;
    this.guard = guard;
    this.categories = categories;
    this.incomeSettlement = incomeSettlement;
    this.clock = clock;
  }

  @Transactional
  public TransactionPage list(long userId, TransactionSearch.Filter filter, int page, int size) {
    if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
      throw new ApiException(ErrorCode.BAD_REQUEST, "Paginação inválida.");
    }
    incomeSettlement.settleDue(userId);
    TransactionSearch.Result result = search.search(userId, filter, page, size);
    return new TransactionPage(
        mapper.toResponses(
            result.rows().stream().map(TransactionSearch.Row::transaction).toList(),
            groupByTransaction(result.rows())),
        page,
        size,
        result.total());
  }

  private static Function<Transaction, TransactionGroup> groupByTransaction(
      List<TransactionSearch.Row> rows) {
    Map<Long, TransactionGroup> byTransaction = new HashMap<>();
    rows.forEach(r -> byTransaction.put(r.transaction().getId(), r.group()));
    return t -> byTransaction.get(t.getId());
  }

  @Transactional
  public TransactionResponse get(long userId, long id) {
    incomeSettlement.settleDue(userId);
    Transaction tx = load(userId, id);
    return mapper.toResponse(tx, group(tx));
  }

  @Transactional
  public TransactionResponse patch(long userId, long id, Patch patch) {
    incomeSettlement.settleDue(userId);
    Transaction tx = load(userId, id);
    boolean card = guard.lockIfCard(userId, tx.getAccountId()).isPresent();
    // Receita fora de cartão entra e sai do caixa pela data: editável mesmo depois de recebida.
    boolean autoIncome = !card && isIncome(tx);
    checkVersion(tx, patch.version());
    if (tx.isPaid() && !autoIncome) {
      throw new ApiException(
          ErrorCode.CONFLICT,
          "Ocorrências já pagas não podem ser editadas. Desfaça o pagamento antes.");
    }
    if (patch.amount() == null && patch.dueDate() == null) {
      throw ApiException.validation("Informe o valor ou o vencimento.");
    }
    boolean dueDateChanged = patch.dueDate() != null && !patch.dueDate().equals(tx.getDueDate());
    if (dueDateChanged) {
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
    // Só a mudança de data reavalia o status; editar o valor não mexe em status nem em paymentDate.
    if (autoIncome && dueDateChanged) {
      if (tx.getDueDate().isAfter(LocalDate.now(clock))) {
        tx.markPending();
      } else {
        tx.markPaid(tx.getDueDate());
      }
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
    incomeSettlement.settleDue(userId);
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
    incomeSettlement.settleDue(userId);
    Transaction tx = load(userId, id);
    if (!tx.isPaid()) {
      throw new ApiException(ErrorCode.CONFLICT, "Este lançamento não está pago.");
    }
    if (!tx.getDueDate().isAfter(LocalDate.now(clock))
        && isIncome(tx)
        && guard.lockIfCard(userId, tx.getAccountId()).isEmpty()) {
      throw new ApiException(
          ErrorCode.CONFLICT,
          "Esta receita já entrou na conta na data informada. Para corrigir, edite ou exclua o lançamento.");
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

  private boolean isIncome(Transaction tx) {
    return categories
        .findByIdAndUserId(tx.getCategoryId(), tx.getUserId())
        .filter(c -> c.getType() == CategoryType.INCOME)
        .isPresent();
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
