package com.jvtech.gefinc.account;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;

/** Corpos de requisição e resposta de {@code /accounts}, conforme o contrato OpenAPI. */
public final class AccountDtos {

  /**
   * {@code #RRGGBB}, obrigatoriamente (no {@code POST} a cor é omitida ou válida; vazio é
   * recusado).
   */
  static final String COLOR_REGEX = "^#[0-9A-Fa-f]{6}$";

  /** {@code #RRGGBB} ou a string vazia, que em {@code PUT} significa "remover a cor". */
  static final String COLOR_UPDATE_REGEX = "^(#[0-9A-Fa-f]{6})?$";

  static final String COLOR_MESSAGE = "Use uma cor no formato #RRGGBB.";

  private AccountDtos() {}

  public record AccountInput(
      @NotBlank(message = "Informe o nome.") @Size(max = 80, message = "Nome muito longo.")
          String name,
      @NotNull(message = "Informe o tipo.") AccountType type,
      @Min(value = 1, message = "O dia deve estar entre 1 e 31.")
          @Max(value = 31, message = "O dia deve estar entre 1 e 31.")
          Integer closingDay,
      @Min(value = 1, message = "O dia deve estar entre 1 e 31.")
          @Max(value = 31, message = "O dia deve estar entre 1 e 31.")
          Integer dueDay,
      HolderType holderType,
      AccountIcon icon,
      Long bankAccountId,
      @Pattern(regexp = COLOR_REGEX, message = COLOR_MESSAGE) String colorHex,
      @Digits(integer = 15, fraction = 2, message = "Valor fora do limite permitido.")
          BigDecimal openingBalance) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "AccountInput[REDACTED]";
    }
  }

  public record AccountUpdate(
      @NotBlank(message = "Informe o nome.") @Size(max = 80, message = "Nome muito longo.")
          String name,
      @NotNull(message = "Informe o tipo.") AccountType type,
      @Min(value = 1, message = "O dia deve estar entre 1 e 31.")
          @Max(value = 31, message = "O dia deve estar entre 1 e 31.")
          Integer closingDay,
      @Min(value = 1, message = "O dia deve estar entre 1 e 31.")
          @Max(value = 31, message = "O dia deve estar entre 1 e 31.")
          Integer dueDay,
      HolderType holderType,
      AccountIcon icon,
      Long bankAccountId,
      @Pattern(regexp = COLOR_UPDATE_REGEX, message = COLOR_MESSAGE) String colorHex,
      @Digits(integer = 15, fraction = 2, message = "Valor fora do limite permitido.")
          BigDecimal openingBalance,
      @NotNull(message = "Informe se a conta está ativa.") Boolean active,
      @NotNull(message = "Informe a versão.") Long version) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "AccountUpdate[REDACTED]";
    }
  }

  public record AccountResponse(
      long id,
      String name,
      AccountType type,
      Integer closingDay,
      Integer dueDay,
      HolderType holderType,
      AccountIcon icon,
      Long bankAccountId,
      String bankAccountName,
      String colorHex,
      BigDecimal openingBalance,
      boolean active,
      long version) {

    /**
     * Resposta da conta. O ícone vem sempre preenchido (o escolhido ou o padrão do tipo) e o cartão
     * herda o titular da conta bancária vinculada, cujo nome também é devolvido.
     */
    static AccountResponse of(Account a, Account bank) {
      HolderType holder = bank != null ? bank.getHolderType() : a.getHolderType();
      AccountIcon icon =
          a.getIcon() != null ? a.getIcon() : AccountIcon.defaultFor(a.getType(), holder);
      return new AccountResponse(
          a.getId(),
          a.getName(),
          a.getType(),
          a.getClosingDay(),
          a.getDueDay(),
          holder,
          icon,
          a.getBankAccountId(),
          bank != null ? bank.getName() : null,
          a.getColorHex(),
          a.getOpeningBalance(),
          a.isActive(),
          a.getVersion());
    }
  }

  public record LinkedCard(long id, String name) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "LinkedCard[REDACTED]";
    }
  }

  /**
   * Prévia da exclusão: o que impede excluir a conta. {@code canDelete} só é verdadeiro sem
   * lançamentos, pagamentos de fatura, transferências, cartões vinculados e saldo inicial.
   */
  public record AccountUsage(
      boolean canDelete,
      long transactionCount,
      long invoicePaymentCount,
      long transferCount,
      List<LinkedCard> linkedCards,
      BigDecimal openingBalance) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "AccountUsage[REDACTED]";
    }
  }
}
