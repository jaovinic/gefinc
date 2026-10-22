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
      LocalDate firstDueDate) {}

  public record GroupUpdate(
      @NotBlank(message = "Informe a descrição.")
          @Size(max = 120, message = "Descrição muito longa.")
          String description,
      @NotNull(message = "Informe a categoria.") Long categoryId,
      @NotNull(message = "Informe a versão.") Long version) {}

  public record AmountChange(
      @NotNull(message = "Informe o mês.") YearMonth fromMonth,
      @NotNull(message = "Informe o valor.")
          @DecimalMin(value = "0.01", message = POSITIVE)
          @Digits(integer = 15, fraction = 2, message = "Valor fora do limite permitido.")
          BigDecimal amount) {}

  public record EndRequest(@NotNull(message = "Informe o mês.") YearMonth endMonth) {}

  public record Patch(
      @DecimalMin(value = "0.01", message = POSITIVE)
          @Digits(integer = 15, fraction = 2, message = "Valor fora do limite permitido.")
          BigDecimal amount,
      LocalDate dueDate,
      @NotNull(message = "Informe a versão.") Long version) {}

  public record PayRequest(
      @NotNull(message = "Informe a data do pagamento.") LocalDate paymentDate) {}

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
      long version) {}

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
      List<TransactionResponse> transactions) {}

  public record TransactionPage(
      List<TransactionResponse> content, int page, int size, long totalElements) {}

  public record GroupImpact(
      long paidCount, long pendingCount, BigDecimal paidAmount, BigDecimal pendingAmount) {}
}
