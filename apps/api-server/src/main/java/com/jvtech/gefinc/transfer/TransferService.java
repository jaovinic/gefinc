package com.jvtech.gefinc.transfer;

import com.jvtech.gefinc.account.Account;
import com.jvtech.gefinc.account.AccountRepository;
import com.jvtech.gefinc.account.AccountType;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.transfer.TransferDtos.TransferInput;
import com.jvtech.gefinc.transfer.TransferDtos.TransferPage;
import com.jvtech.gefinc.transfer.TransferDtos.TransferResponse;
import com.jvtech.gefinc.transfer.TransferDtos.TransferUpdate;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Transferências de saldo entre contas bancárias ou de dinheiro do mesmo usuário.
 *
 * <p>Concorrência: criar e editar travam as duas contas com {@link AccountRepository#findForUpdate}
 * em ordem crescente de id (A para B e B para A simultâneas não entram em deadlock) e serializam
 * contra {@code AccountService.delete}, que trava a mesma linha e recusa excluir conta com
 * transferência. O saldo é derivado das linhas, sem estado gravado, então transferências
 * simultâneas não corrompem nada. {@code AccountService.update} não usa a trava pessimista (usa
 * {@code @Version}): inativar uma conta no meio de uma transferência é inofensivo, pois a
 * transferência já aceita continua válida e as seguintes passam a ser recusadas. A chave
 * estrangeira composta {@code (conta, user_id)} é a rede final.
 *
 * <p>Saldo insuficiente é permitido, como nas despesas.
 */
@Service
public class TransferService {

  static final int MAX_PAGE_SIZE = 200;

  private static final String ACCOUNT_NOT_FOUND = "Conta não encontrada.";

  /** Faixa aceita para {@code transferDate}: anos de 1900 a 2200, inclusive. */
  static final LocalDate MIN_DATE = LocalDate.of(1900, 1, 1);

  static final LocalDate MAX_DATE = LocalDate.of(2200, 12, 31);

  static final String DATE_RANGE_MESSAGE = "A data deve estar entre os anos 1900 e 2200.";

  /** SQLState de violação de chave estrangeira. */
  private static final String FK_VIOLATION = "23503";

  /** Chaves estrangeiras compostas (conta, usuário) de {@code account_transfers}. */
  private static final List<String> ACCOUNT_FKS = List.of("fk_at_from", "fk_at_to");

  private final TransferRepository transfers;
  private final AccountRepository accounts;
  private final Clock clock;

  TransferService(TransferRepository transfers, AccountRepository accounts, Clock clock) {
    this.transfers = transfers;
    this.accounts = accounts;
    this.clock = clock;
  }

  @Transactional
  public TransferResponse create(long userId, TransferInput input) {
    validateDistinct(input.fromAccountId(), input.toAccountId());
    validateDate(input.transferDate());
    lockAndValidate(userId, input.fromAccountId(), input.toAccountId());
    AccountTransfer transfer =
        new AccountTransfer(
            userId,
            input.fromAccountId(),
            input.toAccountId(),
            input.amount(),
            input.transferDate(),
            normalize(input.description()),
            clock.instant());
    return respond(save(transfer));
  }

  @Transactional
  public TransferResponse update(long userId, long id, TransferUpdate input) {
    AccountTransfer transfer = load(userId, id);
    if (transfer.getVersion() != input.version()) {
      throw new ApiException(
          ErrorCode.STALE_VERSION,
          "A transferência foi alterada em outro lugar. Recarregue e tente novamente.");
    }
    validateDistinct(input.fromAccountId(), input.toAccountId());
    validateDate(input.transferDate());
    lockAndValidate(userId, input.fromAccountId(), input.toAccountId());
    transfer.change(
        input.fromAccountId(),
        input.toAccountId(),
        input.amount(),
        input.transferDate(),
        normalize(input.description()));
    return respond(save(transfer));
  }

  /** Excluir é estornar: o saldo volta ao que era. Permitido mesmo com conta inativa. */
  @Transactional
  public void delete(long userId, long id) {
    transfers.delete(load(userId, id));
    transfers.flush();
  }

  @Transactional(readOnly = true)
  public TransferResponse get(long userId, long id) {
    return respond(load(userId, id));
  }

  @Transactional(readOnly = true)
  public TransferPage list(long userId, YearMonth month, Long accountId, int page, int size) {
    if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
      throw new ApiException(ErrorCode.BAD_REQUEST, "Paginação inválida.");
    }
    Page<AccountTransfer> result =
        transfers.search(
            userId, month.atDay(1), month.atEndOfMonth(), accountId, PageRequest.of(page, size));
    LocalDate today = LocalDate.now(clock);
    return new TransferPage(
        result.getContent().stream().map(t -> respond(t, today)).toList(),
        page,
        size,
        result.getTotalElements());
  }

  private AccountTransfer load(long userId, long id) {
    return transfers
        .findByIdAndUserId(id, userId)
        .orElseThrow(() -> ApiException.notFound("Transferência não encontrada."));
  }

  private AccountTransfer save(AccountTransfer transfer) {
    try {
      return transfers.saveAndFlush(transfer);
    } catch (DataIntegrityViolationException e) {
      if (isAccountForeignKeyViolation(e)) {
        // Rede final (FK composta): a conta deixou de existir para este usuário.
        throw ApiException.notFound(ACCOUNT_NOT_FOUND);
      }
      throw e;
    }
  }

  /**
   * Só a violação das chaves estrangeiras de conta (SQLState 23503 em {@code fk_at_from} ou {@code
   * fk_at_to}) vira 404; qualquer outra violação de integridade é relançada, não mascarada.
   */
  static boolean isAccountForeignKeyViolation(DataIntegrityViolationException e) {
    for (Throwable t = e; t != null; t = t.getCause() == t ? null : t.getCause()) {
      if (t instanceof SQLException sql && FK_VIOLATION.equals(sql.getSQLState())) {
        return mentionsAccountFk(sql.getMessage());
      }
      if (t instanceof ConstraintViolationException cve
          && cve.getConstraintName() != null
          && ACCOUNT_FKS.contains(cve.getConstraintName().toLowerCase(Locale.ROOT))
          && cve.getSQLState() != null
          && FK_VIOLATION.equals(cve.getSQLState())) {
        return true;
      }
    }
    return false;
  }

  private static boolean mentionsAccountFk(String message) {
    if (message == null) {
      return false;
    }
    String lower = message.toLowerCase(Locale.ROOT);
    return ACCOUNT_FKS.stream().anyMatch(lower::contains);
  }

  private static void validateDate(LocalDate date) {
    if (date.isBefore(MIN_DATE) || date.isAfter(MAX_DATE)) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("transferDate", DATE_RANGE_MESSAGE);
    }
  }

  private static void validateDistinct(long fromAccountId, long toAccountId) {
    if (fromAccountId == toAccountId) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("toAccountId", "A conta de destino deve ser diferente da origem.");
    }
  }

  /**
   * Trava as duas contas em ordem crescente de id e confere: do usuário (senão 404 idêntico para
   * inexistente e de outro usuário), bancária ou dinheiro (nunca cartão) e ativa.
   */
  private void lockAndValidate(long userId, long fromId, long toId) {
    Map<Long, Account> locked = new HashMap<>();
    for (long id : new long[] {Math.min(fromId, toId), Math.max(fromId, toId)}) {
      locked.put(
          id,
          accounts
              .findForUpdate(id, userId)
              .orElseThrow(() -> ApiException.notFound(ACCOUNT_NOT_FOUND)));
    }
    requireEligible(locked.get(fromId), "fromAccountId", "de origem");
    requireEligible(locked.get(toId), "toAccountId", "de destino");
  }

  private static void requireEligible(Account account, String field, String role) {
    if (account.getType() == AccountType.CREDIT_CARD) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError(
              field, "Cartão de crédito não participa de transferências. Escolha outra conta.");
    }
    if (!account.isActive()) {
      String message = "A conta " + role + " está inativa.";
      throw new ApiException(ErrorCode.ACCOUNT_INACTIVE, message).withFieldError(field, message);
    }
  }

  /** Descrição aparada; vazia vira {@code null}. */
  private static String normalize(String description) {
    if (description == null) {
      return null;
    }
    String stripped = description.strip();
    return stripped.isEmpty() ? null : stripped;
  }

  private TransferResponse respond(AccountTransfer t) {
    return respond(t, LocalDate.now(clock));
  }

  private static TransferResponse respond(AccountTransfer t, LocalDate today) {
    return new TransferResponse(
        t.getId(),
        t.getFromAccountId(),
        t.getToAccountId(),
        t.getAmount(),
        t.getTransferDate(),
        t.getDescription(),
        t.getTransferDate().isAfter(today),
        t.getVersion());
  }
}
