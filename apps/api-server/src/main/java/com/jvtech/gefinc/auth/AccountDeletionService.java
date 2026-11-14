package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.admin.common.AdminPolicy;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import com.jvtech.gefinc.user.UserRole;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Exclusão da conta com carência de 30 dias para o usuário mudar de ideia. */
@Service
public class AccountDeletionService {

  private final UserRepository users;
  private final AuthService auth;
  private final TokenService tokens;
  private final Clock clock;
  private final LoginAttemptLimiter limiter;
  private final DeletionLedger ledger;
  private final Pseudonymizer pseudonymizer;
  private final AdminPolicy adminPolicy;

  public AccountDeletionService(
      UserRepository users,
      AuthService auth,
      TokenService tokens,
      Clock clock,
      LoginAttemptLimiter limiter,
      DeletionLedger ledger,
      Pseudonymizer pseudonymizer,
      AdminPolicy adminPolicy) {
    this.users = users;
    this.auth = auth;
    this.tokens = tokens;
    this.clock = clock;
    this.limiter = limiter;
    this.ledger = ledger;
    this.pseudonymizer = pseudonymizer;
    this.adminPolicy = adminPolicy;
  }

  /**
   * Agenda a exclusão, encerra todas as sessões na hora e devolve a data limite para desistir. A
   * linha do usuário é travada antes da trava consultiva dos administradores (a mesma ordem de
   * {@code AdminRoleService}: linha, depois trava), o que evita deadlock com a retirada do perfil e
   * garante que o papel lido pela guarda é o vigente.
   */
  @Transactional
  public LocalDate request(long userId, String password) {
    User user = users.findForUpdate(userId).orElseThrow(AuthService::invalidCredentials);
    if (!auth.matches(password, user.getPasswordHash())) {
      throw AuthService.invalidCredentials();
    }
    requireDeletable(user);
    Instant now = clock.instant();
    Instant dueAt = now.plus(Duration.ofDays(AuthService.DELETION_GRACE_DAYS));
    // O livro-razão é gravado antes: a coluna deletion_request_id de users referencia a linha.
    long requestId = ledger.openUserRequest(userId, pseudonymizer.userRef(userId), now, dueAt);
    user.scheduleDeletion(now, dueAt, requestId);
    tokens.revokeAllOfUser(userId, RevokedBy.USER);
    return auth.deletionDate(user);
  }

  /**
   * Guarda mínima do autoatendimento (US1.6): o raiz nunca se exclui (a restrição do banco o
   * recusaria) e o administrador não deixa o sistema sem administrador ativo (sob a trava
   * consultiva do conjunto de administradores).
   */
  private void requireDeletable(User user) {
    if (user.getRole() == UserRole.ROOT) {
      throw new ApiException(
          ErrorCode.ROOT_PROTECTED, "O administrador raiz não pode excluir a própria conta.");
    }
    if (user.getRole().isAdmin() && user.isActive()) {
      adminPolicy.requireAnotherActiveAdmin(user.getId());
    }
  }

  /** Cancela a exclusão pendente a partir das credenciais (o usuário não tem sessão). */
  @Transactional
  public void cancel(String email, String password, String clientIp) {
    // Mesmo limite do login: este caminho também testa e-mail e senha sem sessão.
    limiter.checkAllowed(email, clientIp);
    User user = users.findByEmail(email.strip()).orElse(null);
    if (user == null || !auth.matches(password, user.getPasswordHash())) {
      limiter.recordFailure(email, clientIp);
      throw AuthService.invalidCredentials();
    }
    limiter.recordSuccess(email);
    if (!user.isDeletionPending()) {
      throw new ApiException(
          ErrorCode.NO_PENDING_DELETION, "Não há exclusão pendente nesta conta.");
    }
    ledger.markCanceled(user.getDeletionRequestId(), clock.instant());
    user.cancelDeletion();
  }

  /**
   * Apaga definitivamente as contas com a carência vencida (o banco remove os dados em cascata).
   */
  @Transactional
  public int deleteExpired() {
    Instant limit = clock.instant().minus(Duration.ofDays(AuthService.DELETION_GRACE_DAYS));
    ledger.markExecutedDue(limit, clock.instant());
    return users.deleteExpiredDeletions(limit);
  }
}
