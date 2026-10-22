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
          Integer dueDay) {}

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
      @NotNull(message = "Informe se a conta está ativa.") Boolean active,
      @NotNull(message = "Informe a versão.") Long version) {}

  public record AccountResponse(
      long id,
      String name,
      AccountType type,
      Integer closingDay,
      Integer dueDay,
      boolean active,
      long version) {

    static AccountResponse of(Account a) {
      return new AccountResponse(
          a.getId(),
          a.getName(),
          a.getType(),
          a.getClosingDay(),
          a.getDueDay(),
          a.isActive(),
          a.getVersion());
    }
  }
}
