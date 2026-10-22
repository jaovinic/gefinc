package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
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

  public AccountDeletionService(
      UserRepository users, AuthService auth, TokenService tokens, Clock clock) {
    this.users = users;
    this.auth = auth;
    this.tokens = tokens;
    this.clock = clock;
  }

  /** Agenda a exclusão, encerra todas as sessões na hora e devolve a data limite para desistir. */
  @Transactional
  public LocalDate request(long userId, String password) {
    User user = users.findById(userId).orElseThrow(AuthService::invalidCredentials);
    if (!auth.matches(password, user.getPasswordHash())) {
      throw AuthService.invalidCredentials();
    }
    user.requestDeletion(clock.instant());
    tokens.revokeAllOfUser(userId);
    return auth.deletionDate(user);
  }

  /** Cancela a exclusão pendente a partir das credenciais (o usuário não tem sessão). */
  @Transactional
  public void cancel(String email, String password) {
    User user = users.findByEmail(email.strip()).orElse(null);
    if (user == null || !auth.matches(password, user.getPasswordHash())) {
      throw AuthService.invalidCredentials();
    }
    if (!user.isDeletionPending()) {
      throw new ApiException(
          ErrorCode.NO_PENDING_DELETION, "Não há exclusão pendente nesta conta.");
    }
    user.cancelDeletion();
  }

  /**
   * Apaga definitivamente as contas com a carência vencida (o banco remove os dados em cascata).
   */
  @Transactional
  public int deleteExpired() {
    Instant limit = clock.instant().minus(Duration.ofDays(AuthService.DELETION_GRACE_DAYS));
    return users.deleteExpiredDeletions(limit);
  }
}
