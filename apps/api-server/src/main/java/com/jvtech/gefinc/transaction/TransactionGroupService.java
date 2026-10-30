package com.jvtech.gefinc.transaction;

import com.jvtech.gefinc.account.Account;
import com.jvtech.gefinc.account.AccountRepository;
import com.jvtech.gefinc.category.Category;
import com.jvtech.gefinc.category.CategoryRepository;
import com.jvtech.gefinc.category.CategoryType;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.invoice.InvoiceBalanceGuard;
import com.jvtech.gefinc.transaction.TransactionDtos.AmountChange;
import com.jvtech.gefinc.transaction.TransactionDtos.GroupImpact;
import com.jvtech.gefinc.transaction.TransactionDtos.GroupInput;
import com.jvtech.gefinc.transaction.TransactionDtos.GroupUpdate;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Cria e mantém os grupos de lançamento (avulso, fixo e parcelado) e suas ocorrências. */
@Service
public class TransactionGroupService {

  /** Janela de ocorrências de um lançamento fixo: mês corrente mais 11 (12 meses). */
  static final int FIXED_WINDOW_MONTHS = 12;

  private final TransactionGroupRepository groups;
  private final TransactionRepository transactions;
  private final AccountRepository accounts;
  private final CategoryRepository categories;
  private final Clock clock;
  private final InvoiceBalanceGuard guard;
  private final IncomeSettlement incomeSettlement;

  public TransactionGroupService(
      TransactionGroupRepository groups,
      TransactionRepository transactions,
      AccountRepository accounts,
      CategoryRepository categories,
      Clock clock,
      InvoiceBalanceGuard guard,
      IncomeSettlement incomeSettlement) {
    this.groups = groups;
    this.transactions = transactions;
    this.accounts = accounts;
    this.categories = categories;
    this.clock = clock;
    this.guard = guard;
    this.incomeSettlement = incomeSettlement;
  }

  /** Grupo com as suas ocorrências. */
  public record GroupView(TransactionGroup group, List<Transaction> transactions) {}

  @Transactional
  public GroupView create(long userId, GroupInput input) {
    Account account = activeAccount(userId, input.accountId());
    Category category =
        categories
            .findByIdAndUserId(input.categoryId(), userId)
            .orElseThrow(() -> ApiException.notFound("Categoria não encontrada."));
    if (category.getType() == CategoryType.INCOME && account.isCreditCard()) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError(
              "accountId",
              "Receitas só podem entrar em conta bancária ou dinheiro, não em cartão de crédito.");
    }
    int installments = input.totalInstallments() == null ? 1 : input.totalInstallments();
    if (input.recurrenceType() != RecurrenceType.INSTALLMENT && installments != 1) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError(
              "totalInstallments", "Somente lançamentos parcelados têm mais de uma parcela.");
    }
    GroupView created =
        switch (input.recurrenceType()) {
          case VARIABLE -> createVariable(userId, account, input);
          case FIXED -> createFixed(userId, account, input);
          case INSTALLMENT -> createInstallments(userId, account, input, installments);
        };
    // Receita com vencimento até hoje já entra na conta; a liquidação limpa o contexto de
    // persistência, então o grupo é lido de novo.
    incomeSettlement.settleDue(userId);
    return view(userId, created.group().getId());
  }

  private GroupView createVariable(long userId, Account account, GroupInput input) {
    LocalDate due = firstDueDate(account, input);
    TransactionGroup group = saveGroup(userId, input, 1, due);
    Transaction tx =
        transactions.saveAndFlush(
            new Transaction(
                group.getId(),
                userId,
                account.getId(),
                input.categoryId(),
                1,
                input.totalAmount(),
                due));
    return new GroupView(group, List.of(tx));
  }

  private GroupView createFixed(long userId, Account account, GroupInput input) {
    LocalDate due = firstDueDate(account, input);
    TransactionGroup group = saveGroup(userId, input, 1, due);
    List<Transaction> created = new ArrayList<>();
    generateFixed(group, account, 0, created);
    return new GroupView(group, created);
  }

  private GroupView createInstallments(
      long userId, Account account, GroupInput input, int installments) {
    if (input.totalInstallments() == null) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("totalInstallments", "Informe a quantidade de parcelas.");
    }
    if (installments == 1) {
      // Uma parcela é tratada como compra avulsa, sem erro.
      GroupInput single =
          new GroupInput(
              input.description(),
              RecurrenceType.VARIABLE,
              input.totalAmount(),
              1,
              input.accountId(),
              input.categoryId(),
              input.purchaseDate(),
              input.firstDueDate());
      return createVariable(userId, account, single);
    }
    if (input.totalAmount().movePointRight(2).longValueExact() < installments) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError(
              "totalAmount",
              "O valor deve ter pelo menos R$ 0,01 por parcela (" + installments + " parcelas).");
    }
    if (!account.isCreditCard() && input.firstDueDate() == null) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("firstDueDate", "Informe o vencimento da primeira parcela.");
    }
    List<InstallmentScheduler.Installment> schedule =
        InstallmentScheduler.schedule(
            account.isCreditCard() ? account.getClosingDay() : null,
            account.isCreditCard() ? account.getDueDay() : null,
            input.purchaseDate(),
            input.firstDueDate(),
            input.totalAmount(),
            installments);
    TransactionGroup group = saveGroup(userId, input, installments, schedule.get(0).dueDate());
    List<Transaction> created = new ArrayList<>();
    for (InstallmentScheduler.Installment installment : schedule) {
      created.add(
          transactions.save(
              new Transaction(
                  group.getId(),
                  userId,
                  account.getId(),
                  input.categoryId(),
                  installment.number(),
                  installment.amount(),
                  installment.dueDate())));
    }
    transactions.flush();
    return new GroupView(group, created);
  }

  /**
   * Vencimento da primeira ocorrência: calculado pela fatura no cartão; informado nas demais
   * contas.
   */
  private LocalDate firstDueDate(Account account, GroupInput input) {
    if (account.isCreditCard()) {
      return DueDateCalculator.invoiceDueDate(
          input.purchaseDate(), account.getClosingDay(), account.getDueDay());
    }
    if (input.firstDueDate() == null) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("firstDueDate", "Informe o vencimento.");
    }
    return input.firstDueDate();
  }

  private TransactionGroup saveGroup(
      long userId, GroupInput input, int installments, LocalDate firstDueDate) {
    return groups.saveAndFlush(
        new TransactionGroup(
            userId,
            input.description().strip(),
            input.recurrenceType(),
            installments,
            input.totalAmount(),
            input.accountId(),
            input.categoryId(),
            input.purchaseDate(),
            firstDueDate,
            clock.instant()));
  }

  /**
   * Gera as ocorrências do lançamento fixo a partir do índice informado até o horizonte (mês
   * corrente mais 11) ou o mês de encerramento. A primeira ocorrência é sempre gerada.
   *
   * @return quantas ocorrências foram criadas
   */
  int generateFixed(TransactionGroup group, Account account, int fromIndex, List<Transaction> out) {
    YearMonth horizon = YearMonth.now(clock).plusMonths(FIXED_WINDOW_MONTHS - 1);
    YearMonth end = group.getEndMonth() == null ? null : YearMonth.from(group.getEndMonth());
    int created = 0;
    for (int index = fromIndex; index < 1200; index++) {
      LocalDate due = FixedSchedule.dueDate(account, group, index);
      YearMonth month = YearMonth.from(due);
      if (index > 0 && month.isAfter(horizon)) {
        break;
      }
      if (end != null && month.isAfter(end)) {
        break;
      }
      out.add(
          transactions.save(
              new Transaction(
                  group.getId(),
                  group.getUserId(),
                  group.getAccountId(),
                  group.getCategoryId(),
                  index + 1,
                  group.getTotalAmount(),
                  due)));
      created++;
    }
    transactions.flush();
    return created;
  }

  @Transactional
  public GroupView get(long userId, long groupId) {
    incomeSettlement.settleDue(userId);
    return view(userId, groupId);
  }

  private GroupView view(long userId, long groupId) {
    TransactionGroup group = load(userId, groupId);
    return new GroupView(
        group, transactions.findByGroupIdAndUserIdOrderByInstallmentNumber(groupId, userId));
  }

  @Transactional
  public GroupView update(long userId, long groupId, GroupUpdate input) {
    incomeSettlement.settleDue(userId);
    TransactionGroup group = load(userId, groupId);
    if (group.getVersion() != input.version()) {
      throw new ApiException(
          ErrorCode.STALE_VERSION,
          "O lançamento foi alterado em outro lugar. Recarregue e tente de novo.");
    }
    Category current = categories.findByIdAndUserId(group.getCategoryId(), userId).orElseThrow();
    Category target =
        categories
            .findByIdAndUserId(input.categoryId(), userId)
            .orElseThrow(() -> ApiException.notFound("Categoria não encontrada."));
    if (target.getType() != current.getType()) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("categoryId", "A categoria deve ser do mesmo tipo (receita ou despesa).");
    }
    group.setDescription(input.description().strip());
    group.setCategoryId(target.getId());
    groups.saveAndFlush(group);
    transactions.reassignPendingOfGroup(groupId, userId, target.getId());
    return get(userId, groupId);
  }

  /** Altera o valor mensal de um lançamento fixo a partir de um mês (ocorrências pendentes). */
  @Transactional
  public GroupView changeAmount(long userId, long groupId, AmountChange change) {
    incomeSettlement.settleDue(userId);
    TransactionGroup group = load(userId, groupId);
    requireFixed(group, "Somente lançamentos fixos têm valor mensal alterável.");
    boolean card = guard.lockIfCard(userId, group.getAccountId()).isPresent();
    List<Transaction> all =
        transactions.findByGroupIdAndUserIdOrderByInstallmentNumber(groupId, userId);
    YearMonth last = YearMonth.from(all.get(all.size() - 1).getReferenceMonth());
    if (change.fromMonth().isAfter(last)) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError(
              "fromMonth",
              "O mês deve estar dentro das ocorrências já geradas (até " + last + ").");
    }
    LocalDate from = change.fromMonth().atDay(1);
    List<LocalDate> changedMonths = new ArrayList<>();
    for (Transaction tx : all) {
      if (!tx.isPaid() && !tx.getReferenceMonth().isBefore(from)) {
        tx.setAmount(change.amount());
        changedMonths.add(tx.getReferenceMonth());
      }
    }
    group.setTotalAmount(change.amount());
    groups.saveAndFlush(group);
    transactions.flush();
    if (card) {
      guard.assertNotOverpaid(userId, group.getAccountId(), changedMonths);
    }
    return get(userId, groupId);
  }

  /** Encerra um lançamento fixo: remove as ocorrências pendentes depois do mês informado. */
  @Transactional
  public GroupView end(long userId, long groupId, YearMonth endMonth) {
    incomeSettlement.settleDue(userId);
    TransactionGroup group = load(userId, groupId);
    requireFixed(group, "Somente lançamentos fixos podem ser encerrados.");
    boolean card = guard.lockIfCard(userId, group.getAccountId()).isPresent();
    LocalDate end = endMonth.atDay(1);
    List<LocalDate> removedMonths =
        transactions.findByGroupIdAndUserIdOrderByInstallmentNumber(groupId, userId).stream()
            .filter(t -> !t.isPaid() && t.getReferenceMonth().isAfter(end))
            .map(Transaction::getReferenceMonth)
            .distinct()
            .toList();
    group.setEndMonth(end);
    groups.saveAndFlush(group);
    transactions.deletePendingAfter(groupId, userId, end);
    if (card) {
      guard.assertNotOverpaid(userId, group.getAccountId(), removedMonths);
    }
    return get(userId, groupId);
  }

  @Transactional
  public GroupImpact impact(long userId, long groupId) {
    incomeSettlement.settleDue(userId);
    load(userId, groupId);
    return new GroupImpact(
        transactions.countByStatus(groupId, userId, TransactionStatus.PAID),
        transactions.countByStatus(groupId, userId, TransactionStatus.PENDING),
        transactions.sumByStatus(groupId, userId, TransactionStatus.PAID),
        transactions.sumByStatus(groupId, userId, TransactionStatus.PENDING));
  }

  /**
   * Exclui as ocorrências pendentes; as já pagas são preservadas. Se não restar nenhuma, o grupo
   * também é excluído; se restarem pagas num lançamento fixo, ele é encerrado no último mês pago
   * para que a rotina não volte a gerar ocorrências. Receita avulsa é a exceção: some por inteiro,
   * inclusive a já recebida (a receita recebida deixa de compor o saldo da conta).
   */
  @Transactional
  public void delete(long userId, long groupId, boolean confirm) {
    incomeSettlement.settleDue(userId);
    TransactionGroup group = load(userId, groupId);
    if (!confirm) {
      throw ApiException.validation("Confirme a exclusão.")
          .withFieldError("confirm", "A exclusão precisa ser confirmada.");
    }
    boolean card = guard.lockIfCard(userId, group.getAccountId()).isPresent();
    if (!card
        && group.getRecurrenceType() == RecurrenceType.VARIABLE
        && categories
            .findByIdAndUserId(group.getCategoryId(), userId)
            .filter(c -> c.getType() == CategoryType.INCOME)
            .isPresent()) {
      transactions.deleteAllOfGroup(groupId, userId);
      groups.delete(group);
      groups.flush();
      return;
    }
    List<LocalDate> removedMonths =
        transactions.findByGroupIdAndUserIdOrderByInstallmentNumber(groupId, userId).stream()
            .filter(t -> !t.isPaid())
            .map(Transaction::getReferenceMonth)
            .distinct()
            .toList();
    transactions.deletePendingOfGroup(groupId, userId);
    if (card) {
      guard.assertNotOverpaid(userId, group.getAccountId(), removedMonths);
    }
    LocalDate lastPaid = transactions.lastPaidMonth(groupId, userId);
    if (lastPaid == null) {
      groups.delete(group);
      groups.flush();
    } else if (group.getRecurrenceType() == RecurrenceType.FIXED) {
      group.setEndMonth(lastPaid);
      groups.saveAndFlush(group);
    }
  }

  /** Completa a janela de ocorrências de todos os lançamentos fixos em contas ativas. */
  @Transactional
  public int topUpFixed() {
    int created = 0;
    for (TransactionGroup group : groups.findFixedOfActiveAccounts()) {
      Account account =
          accounts.findByIdAndUserId(group.getAccountId(), group.getUserId()).orElseThrow();
      int next = transactions.maxInstallment(group.getId());
      created += generateFixed(group, account, next, new ArrayList<>());
    }
    return created;
  }

  private TransactionGroup load(long userId, long groupId) {
    return groups
        .findByIdAndUserId(groupId, userId)
        .orElseThrow(() -> ApiException.notFound("Lançamento não encontrado."));
  }

  private Account activeAccount(long userId, long accountId) {
    Account account =
        accounts
            .findByIdAndUserId(accountId, userId)
            .orElseThrow(() -> ApiException.notFound("Conta não encontrada."));
    if (!account.isActive()) {
      throw new ApiException(
          ErrorCode.ACCOUNT_INACTIVE,
          "A conta está inativa. Reative-a para registrar lançamentos.");
    }
    return account;
  }

  private static void requireFixed(TransactionGroup group, String message) {
    if (group.getRecurrenceType() != RecurrenceType.FIXED) {
      throw ApiException.validation(message);
    }
  }

  static BigDecimal zeroIfNull(BigDecimal value) {
    return value == null ? BigDecimal.ZERO : value;
  }
}
