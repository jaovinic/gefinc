package com.jvtech.gefinc.transaction;

import com.jvtech.gefinc.category.Category;
import com.jvtech.gefinc.category.CategoryRepository;
import com.jvtech.gefinc.category.CategoryType;
import com.jvtech.gefinc.transaction.TransactionDtos.GroupDetailResponse;
import com.jvtech.gefinc.transaction.TransactionDtos.TransactionResponse;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Converte entidades em respostas da API, calculando o indicador de atraso com o relógio injetado.
 * Só despesa fica atrasada: receita nunca é atrasada.
 */
@Component
public class TransactionMapper {

  private final Clock clock;
  private final CategoryRepository categories;

  public TransactionMapper(Clock clock, CategoryRepository categories) {
    this.clock = clock;
    this.categories = categories;
  }

  public TransactionResponse toResponse(Transaction tx, TransactionGroup group) {
    return toResponse(tx, group, new IncomeLookup());
  }

  /** Converte várias ocorrências com, no máximo, uma consulta de categorias por usuário. */
  public List<TransactionResponse> toResponses(
      List<Transaction> transactions, Function<Transaction, TransactionGroup> groupOf) {
    IncomeLookup lookup = new IncomeLookup();
    return transactions.stream().map(t -> toResponse(t, groupOf.apply(t), lookup)).toList();
  }

  private TransactionResponse toResponse(
      Transaction tx, TransactionGroup group, IncomeLookup lookup) {
    LocalDate today = LocalDate.now(clock);
    boolean overdue =
        tx.getStatus() == TransactionStatus.PENDING
            && tx.getDueDate().isBefore(today)
            && !lookup.isIncome(tx);
    return new TransactionResponse(
        tx.getId(),
        tx.getGroupId(),
        tx.getAccountId(),
        tx.getCategoryId(),
        group.getDescription(),
        group.getRecurrenceType(),
        tx.getInstallmentNumber(),
        group.getTotalInstallments(),
        tx.getAmount(),
        tx.getDueDate(),
        tx.getPaymentDate(),
        tx.getStatus(),
        tx.getSettledByPaymentId() != null,
        overdue,
        tx.getVersion());
  }

  /**
   * Categorias de receita do usuário, carregadas de uma vez e só quando alguma ocorrência está
   * pendente e vencida (caso raro): evita uma consulta por ocorrência.
   */
  private final class IncomeLookup {
    private final Map<Long, Set<Long>> incomeIdsByUser = new HashMap<>();

    boolean isIncome(Transaction tx) {
      return incomeIdsByUser
          .computeIfAbsent(
              tx.getUserId(),
              userId ->
                  categories.findAllOfUserByType(userId, CategoryType.INCOME).stream()
                      .map(Category::getId)
                      .collect(Collectors.toSet()))
          .contains(tx.getCategoryId());
    }
  }

  public GroupDetailResponse toDetail(TransactionGroup group, List<Transaction> transactions) {
    return new GroupDetailResponse(
        group.getId(),
        group.getDescription(),
        group.getRecurrenceType(),
        group.getTotalInstallments(),
        group.getTotalAmount(),
        group.getAccountId(),
        group.getCategoryId(),
        group.getPurchaseDate(),
        group.getEndMonth() == null ? null : YearMonth.from(group.getEndMonth()),
        group.getVersion(),
        transactions.stream().map(t -> toResponse(t, group)).toList());
  }
}
