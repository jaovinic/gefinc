package com.jvtech.gefinc.transaction;

import com.jvtech.gefinc.transaction.TransactionDtos.GroupDetailResponse;
import com.jvtech.gefinc.transaction.TransactionDtos.TransactionResponse;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Converte entidades em respostas da API, calculando o indicador de atraso com o relógio injetado.
 */
@Component
public class TransactionMapper {

  private final Clock clock;

  public TransactionMapper(Clock clock) {
    this.clock = clock;
  }

  public TransactionResponse toResponse(Transaction tx, TransactionGroup group) {
    LocalDate today = LocalDate.now(clock);
    boolean overdue =
        tx.getStatus() == TransactionStatus.PENDING && tx.getDueDate().isBefore(today);
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
