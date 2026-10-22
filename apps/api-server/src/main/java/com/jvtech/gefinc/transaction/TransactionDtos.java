package com.jvtech.gefinc.transaction;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/** Corpos de requisição e resposta de lançamentos, conforme o contrato OpenAPI. */
public final class TransactionDtos {

  private TransactionDtos() {}

  private static final String POSITIVE = "O valor deve ser maior que zero.";

  public record GroupInput(
      @NotBlank(message = "Informe a descrição.")
          @Size(max = 120, message = "Descrição muito longa.")
          String description,
      @NotNull(message = "Informe o tipo de lançamento.") RecurrenceType recurrenceType,
      @NotNull(message = "Informe o valor.")
          @DecimalMin(value = "0.01", message = POSITIVE)
          @Digits(integer = 15, fraction = 2, message = "Valor fora do limite permitido.")
          BigDecimal totalAmount,
      @Min(value = 1, message = "Quantidade de parcelas inválida.")
          @Max(value = 120, message = "No máximo 120 parcelas.")
          Integer totalInstallments,
      @NotNull(message = "Informe a conta.") Long accountId,
      @NotNull(message = "Informe a categoria.") Long categoryId,
      @NotNull(message = "Informe a data da compra.") LocalDate purchaseDate,
      LocalDate firstDueDate) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "GroupInput[REDACTED]";
    }
  }

  public record GroupUpdate(
      @NotBlank(message = "Informe a descrição.")
          @Size(max = 120, message = "Descrição muito longa.")
          String description,
      @NotNull(message = "Informe a categoria.") Long categoryId,
      @NotNull(message = "Informe a versão.") Long version) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "GroupUpdate[REDACTED]";
    }
  }

  public record AmountChange(
      @NotNull(message = "Informe o mês.") YearMonth fromMonth,
      @NotNull(message = "Informe o valor.")
          @DecimalMin(value = "0.01", message = POSITIVE)
          @Digits(integer = 15, fraction = 2, message = "Valor fora do limite permitido.")
          BigDecimal amount) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "AmountChange[REDACTED]";
    }
  }

  public record EndRequest(@NotNull(message = "Informe o mês.") YearMonth endMonth) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "EndRequest[REDACTED]";
    }
  }

  public record Patch(
      @DecimalMin(value = "0.01", message = POSITIVE)
          @Digits(integer = 15, fraction = 2, message = "Valor fora do limite permitido.")
          BigDecimal amount,
      LocalDate dueDate,
      @NotNull(message = "Informe a versão.") Long version) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "Patch[REDACTED]";
    }
  }

  public record PayRequest(
      @NotNull(message = "Informe a data do pagamento.") LocalDate paymentDate) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "PayRequest[REDACTED]";
    }
  }

  public record TransactionResponse(
      long id,
      long groupId,
      long accountId,
      long categoryId,
      String description,
      RecurrenceType recurrenceType,
      int installmentNumber,
      int totalInstallments,
      BigDecimal amount,
      LocalDate dueDate,
      LocalDate paymentDate,
      TransactionStatus status,
      Boolean settledByInvoicePayment,
      boolean overdue,
      long version) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "TransactionResponse[REDACTED]";
    }
  }

  public record GroupDetailResponse(
      long id,
      String description,
      RecurrenceType recurrenceType,
      int totalInstallments,
      BigDecimal totalAmount,
      long accountId,
      long categoryId,
      LocalDate purchaseDate,
      YearMonth endMonth,
      long version,
      List<TransactionResponse> transactions) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "GroupDetailResponse[REDACTED]";
    }
  }

  public record TransactionPage(
      List<TransactionResponse> content, int page, int size, long totalElements) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "TransactionPage[REDACTED]";
    }
  }

  public record GroupImpact(
      long paidCount, long pendingCount, BigDecimal paidAmount, BigDecimal pendingAmount) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "GroupImpact[REDACTED]";
    }
  }
}
