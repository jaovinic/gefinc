package com.jvtech.gefinc.account;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Corpos de requisição e resposta de {@code /accounts}, conforme o contrato OpenAPI. */
public final class AccountDtos {

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
      Long bankAccountId) {
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
          a.isActive(),
          a.getVersion());
    }
  }
}
