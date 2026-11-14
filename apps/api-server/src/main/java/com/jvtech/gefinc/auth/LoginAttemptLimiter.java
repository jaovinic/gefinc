package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.common.error.TooManyRequestsException;
import com.jvtech.gefinc.common.ratelimit.PerKeyRateLimiter;
import java.time.Clock;
import java.time.Duration;
import java.util.Locale;
import org.springframework.stereotype.Component;

/**
 * Limita as tentativas de login que falharam: 5 por e-mail e 20 por IP em 15 minutos. Passou do
 * limite, o servidor responde {@code 429} com {@code Retry-After} antes mesmo de conferir a senha,
 * inclusive quando ela estiver certa. O e-mail é contado igualmente para contas existentes ou não,
 * para que o {@code 429} não revele quais contas existem. Um login bem-sucedido zera a contagem do
 * e-mail (a do IP não, para que quem acerta uma conta não ganhe fôlego para atacar outras).
 *
 * <p>O controle fica em memória: a API roda em uma única instância e reiniciá-la apenas zera as
 * contagens (ver {@code docs/operations.md}).
 */
@Component
public class LoginAttemptLimiter {

  static final int EMAIL_LIMIT = 5;
  static final int IP_LIMIT = 20;
  static final Duration WINDOW = Duration.ofMinutes(15);

  private final PerKeyRateLimiter byEmail;
  private final PerKeyRateLimiter byIp;

  public LoginAttemptLimiter(Clock clock) {
    this.byEmail = new PerKeyRateLimiter(clock, EMAIL_LIMIT, WINDOW);
    this.byIp = new PerKeyRateLimiter(clock, IP_LIMIT, WINDOW);
  }

  /** Lança {@link TooManyRequestsException} se o e-mail ou o IP já esgotou as tentativas. */
  public synchronized void checkAllowed(String email, String ip) {
    long wait = Math.max(byEmail.secondsUntilFree(emailKey(email)), byIp.secondsUntilFree(ip));
    if (wait > 0) {
      throw new TooManyRequestsException(
          "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.", wait);
    }
  }

  public synchronized void recordFailure(String email, String ip) {
    byEmail.record(emailKey(email));
    byIp.record(ip);
  }

  public synchronized void recordSuccess(String email) {
    byEmail.reset(emailKey(email));
  }

  /** Zera as contagens (usado pelos testes para isolar cenários). */
  public synchronized void clear() {
    byEmail.clear();
    byIp.clear();
  }

  private static String emailKey(String email) {
    return TokenService.hash(email.strip().toLowerCase(Locale.ROOT));
  }
}
