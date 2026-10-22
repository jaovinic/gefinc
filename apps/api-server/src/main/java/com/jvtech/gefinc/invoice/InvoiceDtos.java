package com.jvtech.gefinc.invoice;

import com.jvtech.gefinc.transaction.TransactionDtos.TransactionResponse;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/** Corpos de requisição e resposta de faturas, conforme o contrato OpenAPI. */
public final class InvoiceDtos {

  private InvoiceDtos() {}

  public record PaymentInput(
      @NotNull(message = "Informe o valor.")
          @DecimalMin(value = "0.01", message = "O valor deve ser maior que zero.")
          @Digits(integer = 15, fraction = 2, message = "Valor fora do limite permitido.")
          BigDecimal amount,
      @NotNull(message = "Informe a data do pagamento.") LocalDate paidAt) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "PaymentInput[REDACTED]";
    }
  }

  public record SettleRequest(@NotNull(message = "Informe a data do pagamento.") LocalDate paidAt) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "SettleRequest[REDACTED]";
    }
  }

  public record PaymentResponse(long id, BigDecimal amount, LocalDate paidAt) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "PaymentResponse[REDACTED]";
    }
  }

  public record InvoiceResponse(
      long accountId,
      YearMonth month,
      LocalDate dueDate,
      BigDecimal total,
      BigDecimal paidIndividually,
      BigDecimal paidByInvoicePayments,
      BigDecimal remaining,
      List<TransactionResponse> items,
      List<PaymentResponse> payments) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "InvoiceResponse[REDACTED]";
    }
  }

  public record MonthTotals(YearMonth month, BigDecimal total, BigDecimal remaining) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "MonthTotals[REDACTED]";
    }
  }

  public record CardProjection(
      long accountId, String name, BigDecimal totalCommitted, List<MonthTotals> invoices) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "CardProjection[REDACTED]";
    }
  }

  public record ProjectionResponse(List<YearMonth> months, List<CardProjection> cards) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "ProjectionResponse[REDACTED]";
    }
  }
}
