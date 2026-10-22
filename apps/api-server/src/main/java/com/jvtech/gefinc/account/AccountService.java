package com.jvtech.gefinc.account;

import com.jvtech.gefinc.account.AccountDtos.AccountInput;
import com.jvtech.gefinc.account.AccountDtos.AccountResponse;
import com.jvtech.gefinc.account.AccountDtos.AccountUpdate;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
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
    validateProfile(userId, input.type(), input.holderType(), input.bankAccountId(), true, null);
    assertNameFree(userId, name, null);
    try {
      Account account = new Account(userId, name, input.type(), input.closingDay(), input.dueDay());
      account.changeProfile(input.holderType(), input.icon(), input.bankAccountId());
      return accounts.saveAndFlush(account);
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
    boolean onlyActiveChanged =
        account.isCreditCard()
            && account.getBankAccountId() == null
            && input.bankAccountId() == null
            && name.equals(account.getName())
            && Objects.equals(account.getClosingDay(), input.closingDay())
            && Objects.equals(account.getDueDay(), input.dueDay())
            && (input.icon() == null
                || input.icon() == AccountIcon.defaultFor(account.getType(), null)
                || input.icon() == account.getIcon());
    // Cartão anterior ao vínculo: só ativar/inativar dispensa informar a conta bancária.
    validateProfile(
        userId,
        account.getType(),
        input.holderType(),
        input.bankAccountId(),
        !onlyActiveChanged,
        account);
    if (input.active()) {
      assertNameFree(userId, name, account.getId());
    }
    boolean daysChanged =
        account.isCreditCard()
            && (!Objects.equals(account.getClosingDay(), input.closingDay())
                || !Objects.equals(account.getDueDay(), input.dueDay()));
    account.rename(name);
    account.changeDays(input.closingDay(), input.dueDay());
    if (!onlyActiveChanged) {
      account.changeProfile(input.holderType(), input.icon(), input.bankAccountId());
    }
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
    List<Account> cards = accounts.findCardsOfBank(userId, id);
    if (!cards.isEmpty()) {
      String names = cards.stream().map(Account::getName).collect(Collectors.joining(", "));
      throw new ApiException(
          ErrorCode.ACCOUNT_IN_USE,
          "Esta conta tem cartões vinculados ("
              + names
              + "). Inative a conta ou troque o vínculo dos cartões.");
    }
    try {
      accounts.delete(account);
      accounts.flush();
    } catch (DataIntegrityViolationException e) {
      throw new ApiException(
          ErrorCode.ACCOUNT_IN_USE,
          "Esta conta possui lançamentos. Inative a conta para preservar o histórico.");
    }
  }

  /** Resposta de uma conta, já com o titular herdado e o nome da conta bancária do cartão. */
  @Transactional(readOnly = true)
  public AccountResponse response(long userId, Account account) {
    Account bank =
        account.getBankAccountId() == null
            ? null
            : accounts.findByIdAndUserId(account.getBankAccountId(), userId).orElse(null);
    return AccountResponse.of(account, bank);
  }

  /** Respostas de várias contas, resolvendo as contas bancárias dos cartões de uma só vez. */
  @Transactional(readOnly = true)
  public List<AccountResponse> responses(long userId, List<Account> list) {
    Map<Long, Account> byId =
        accounts.findAllOfUser(userId).stream()
            .collect(Collectors.toMap(Account::getId, Function.identity()));
    return list.stream()
        .map(
            a ->
                AccountResponse.of(
                    a, a.getBankAccountId() == null ? null : byId.get(a.getBankAccountId())))
        .toList();
  }

  /**
   * Titular (só conta bancária), ícone e vínculo do cartão. A conta bancária vinculada precisa ser
   * do mesmo usuário (senão 404), do tipo conta bancária e ativa quando o vínculo é novo.
   */
  private void validateProfile(
      long userId,
      AccountType type,
      HolderType holderType,
      Long bankAccountId,
      boolean requireBank,
      Account current) {
    ApiException error = null;
    if (type == AccountType.CHECKING) {
      if (holderType == null) {
        error = field(error, "holderType", "Informe se a conta é de pessoa física ou jurídica.");
      }
      if (bankAccountId != null) {
        error = field(error, "bankAccountId", "Somente cartões de crédito têm conta vinculada.");
      }
    } else {
      if (holderType != null) {
        error = field(error, "holderType", "Somente contas bancárias têm tipo de titular.");
      }
      if (type == AccountType.CASH && bankAccountId != null) {
        error = field(error, "bankAccountId", "Somente cartões de crédito têm conta vinculada.");
      }
      if (type == AccountType.CREDIT_CARD && bankAccountId == null && requireBank) {
        error = field(error, "bankAccountId", "Escolha a conta bancária do cartão.");
      }
    }
    if (error != null) {
      throw error;
    }
    if (type == AccountType.CREDIT_CARD && bankAccountId != null) {
      Account bank =
          accounts
              .findByIdAndUserId(bankAccountId, userId)
              .orElseThrow(() -> ApiException.notFound("Conta bancária não encontrada."));
      if (bank.getType() != AccountType.CHECKING) {
        throw field(null, "bankAccountId", "Escolha uma conta bancária para o cartão.");
      }
      boolean unchanged = current != null && bankAccountId.equals(current.getBankAccountId());
      if (!bank.isActive() && !unchanged) {
        throw new ApiException(
                ErrorCode.ACCOUNT_INACTIVE, "A conta bancária escolhida está inativa.")
            .withFieldError("bankAccountId", "A conta bancária escolhida está inativa.");
      }
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
