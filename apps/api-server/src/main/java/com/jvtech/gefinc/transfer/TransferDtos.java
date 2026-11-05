package com.jvtech.gefinc.transfer;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Corpos de requisição e resposta de {@code /transfers}, conforme o contrato OpenAPI. */
public final class TransferDtos {

  static final String AMOUNT_MIN_MESSAGE = "O valor deve ser maior que zero.";
  static final String AMOUNT_DIGITS_MESSAGE = "Valor fora do limite permitido.";
  static final String DESCRIPTION_MESSAGE = "Descrição muito longa.";

  private TransferDtos() {}

  public record TransferInput(
      @NotNull(message = "Informe a conta de origem.") Long fromAccountId,
      @NotNull(message = "Informe a conta de destino.") Long toAccountId,
      @NotNull(message = "Informe o valor.")
          @DecimalMin(value = "0.01", message = AMOUNT_MIN_MESSAGE)
          @Digits(integer = 15, fraction = 2, message = AMOUNT_DIGITS_MESSAGE)
          BigDecimal amount,
      @NotNull(message = "Informe a data.") LocalDate transferDate,
      @Size(max = 120, message = DESCRIPTION_MESSAGE) String description) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "TransferInput[REDACTED]";
    }
  }

  public record TransferUpdate(
      @NotNull(message = "Informe a conta de origem.") Long fromAccountId,
      @NotNull(message = "Informe a conta de destino.") Long toAccountId,
      @NotNull(message = "Informe o valor.")
          @DecimalMin(value = "0.01", message = AMOUNT_MIN_MESSAGE)
          @Digits(integer = 15, fraction = 2, message = AMOUNT_DIGITS_MESSAGE)
          BigDecimal amount,
      @NotNull(message = "Informe a data.") LocalDate transferDate,
      @Size(max = 120, message = DESCRIPTION_MESSAGE) String description,
      @NotNull(message = "Informe a versão.") Long version) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "TransferUpdate[REDACTED]";
    }
  }

  /**
   * {@code scheduled} é verdadeiro quando a data é futura: o saldo só a considera a partir dela.
   */
  public record TransferResponse(
      long id,
      long fromAccountId,
      long toAccountId,
      BigDecimal amount,
      LocalDate transferDate,
      String description,
      boolean scheduled,
      long version) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "TransferResponse[REDACTED]";
    }
  }

  public record TransferPage(
      List<TransferResponse> content, int page, int size, long totalElements) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "TransferPage[REDACTED]";
    }
  }
}
