package com.jvtech.gefinc.account;

import com.jvtech.gefinc.account.AccountDtos.AccountInput;
import com.jvtech.gefinc.account.AccountDtos.AccountUpdate;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import java.util.List;
import java.util.Objects;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {

  private final AccountRepository accounts;
  private final ApplicationEventPublisher events;

  public AccountService(AccountRepository accounts, ApplicationEventPublisher events) {
    this.accounts = accounts;
    this.events = events;
  }

  @Transactional(readOnly = true)
  public List<Account> list(long userId, boolean includeInactive) {
    return includeInactive ? accounts.findAllOfUser(userId) : accounts.findActiveOfUser(userId);
  }

  @Transactional(readOnly = true)
  public Account get(long userId, long id) {
    return accounts
        .findByIdAndUserId(id, userId)
        .orElseThrow(() -> ApiException.notFound("Conta não encontrada."));
  }

  @Transactional
  public Account create(long userId, AccountInput input) {
    String name = input.name().strip();
    validateDays(input.type(), input.closingDay(), input.dueDay());
    assertNameFree(userId, name, null);
    try {
      return accounts.saveAndFlush(
          new Account(userId, name, input.type(), input.closingDay(), input.dueDay()));
    } catch (DataIntegrityViolationException e) {
      throw nameTaken();
    }
  }

  @Transactional
  public Account update(long userId, long id, AccountUpdate input) {
    Account account = get(userId, id);
    if (account.getVersion() != input.version()) {
      throw new ApiException(
          ErrorCode.STALE_VERSION,
          "A conta foi alterada em outro lugar. Recarregue e tente novamente.");
    }
    if (input.type() != account.getType()) {
      throw ApiException.validation("O tipo da conta não pode ser alterado.")
          .withFieldError("type", "O tipo da conta não pode ser alterado.");
    }
    String name = input.name().strip();
    validateDays(account.getType(), input.closingDay(), input.dueDay());
    if (input.active()) {
      assertNameFree(userId, name, account.getId());
    }
    boolean daysChanged =
        account.isCreditCard()
            && (!Objects.equals(account.getClosingDay(), input.closingDay())
                || !Objects.equals(account.getDueDay(), input.dueDay()));
    account.rename(name);
    account.changeDays(input.closingDay(), input.dueDay());
    account.setActive(input.active());
    try {
      accounts.saveAndFlush(account);
    } catch (DataIntegrityViolationException e) {
      throw nameTaken();
    }
    if (daysChanged) {
      events.publishEvent(new CardDaysChangedEvent(userId, account.getId()));
    }
    return account;
  }

  /**
   * Exclui a conta. Se houver lançamentos vinculados, o banco recusa (chave estrangeira) e a
   * resposta é {@code 409}: o usuário deve inativar a conta em vez de excluí-la (FR-013).
   */
  @Transactional
  public void delete(long userId, long id) {
    Account account = get(userId, id);
    try {
      accounts.delete(account);
      accounts.flush();
    } catch (DataIntegrityViolationException e) {
      throw new ApiException(
          ErrorCode.ACCOUNT_IN_USE,
          "Esta conta possui lançamentos. Inative a conta para preservar o histórico.");
    }
  }

  private void validateDays(AccountType type, Integer closingDay, Integer dueDay) {
    ApiException error = null;
    if (type == AccountType.CREDIT_CARD) {
      if (closingDay == null) {
        error = field(error, "closingDay", "Informe o dia de fechamento da fatura.");
      }
      if (dueDay == null) {
        error = field(error, "dueDay", "Informe o dia de vencimento da fatura.");
      }
    } else {
      if (closingDay != null) {
        error = field(error, "closingDay", "Somente cartões de crédito têm dia de fechamento.");
      }
      if (dueDay != null) {
        error = field(error, "dueDay", "Somente cartões de crédito têm dia de vencimento.");
      }
    }
    if (error != null) {
      throw error;
    }
  }

  private static ApiException field(ApiException error, String field, String message) {
    ApiException e = error == null ? ApiException.validation("Há campos inválidos.") : error;
    return e.withFieldError(field, message);
  }

  private void assertNameFree(long userId, String name, Long excludeId) {
    if (accounts.activeNameExists(userId, name, excludeId)) {
      throw nameTaken();
    }
  }

  private static ApiException nameTaken() {
    return new ApiException(
        ErrorCode.ACCOUNT_NAME_TAKEN, "Já existe uma conta ativa com este nome.");
  }
}
