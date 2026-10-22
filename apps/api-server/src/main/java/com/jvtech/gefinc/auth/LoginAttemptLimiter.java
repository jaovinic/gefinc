package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.common.error.TooManyRequestsException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
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
  private static final int PRUNE_THRESHOLD = 10_000;

  private final Clock clock;
  private final Map<String, Deque<Instant>> byEmail = new HashMap<>();
  private final Map<String, Deque<Instant>> byIp = new HashMap<>();

  public LoginAttemptLimiter(Clock clock) {
    this.clock = clock;
  }

  /** Lança {@link TooManyRequestsException} se o e-mail ou o IP já esgotou as tentativas. */
  public synchronized void checkAllowed(String email, String ip) {
    Instant now = clock.instant();
    long wait =
        Math.max(
            secondsUntilFree(byEmail, emailKey(email), EMAIL_LIMIT, now),
            secondsUntilFree(byIp, ip, IP_LIMIT, now));
    if (wait > 0) {
      throw new TooManyRequestsException(
          "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.", wait);
    }
  }

  public synchronized void recordFailure(String email, String ip) {
    Instant now = clock.instant();
    prune(byEmail, now);
    prune(byIp, now);
    byEmail.computeIfAbsent(emailKey(email), k -> new ArrayDeque<>()).addLast(now);
    byIp.computeIfAbsent(ip, k -> new ArrayDeque<>()).addLast(now);
  }

  public synchronized void recordSuccess(String email) {
    byEmail.remove(emailKey(email));
  }

  /** Zera as contagens (usado pelos testes para isolar cenários). */
  public synchronized void clear() {
    byEmail.clear();
    byIp.clear();
  }

  private long secondsUntilFree(
      Map<String, Deque<Instant>> failures, String key, int limit, Instant now) {
    Deque<Instant> window = failures.get(key);
    if (window == null) {
      return 0;
    }
    while (!window.isEmpty() && !window.peekFirst().plus(WINDOW).isAfter(now)) {
      window.pollFirst();
    }
    if (window.size() < limit) {
      return 0;
    }
    return Duration.between(now, window.peekFirst().plus(WINDOW)).toSeconds() + 1;
  }

  private void prune(Map<String, Deque<Instant>> failures, Instant now) {
    if (failures.size() > PRUNE_THRESHOLD) {
      failures.values().removeIf(w -> w.isEmpty() || !w.peekLast().plus(WINDOW).isAfter(now));
    }
  }

  private static String emailKey(String email) {
    return TokenService.hash(email.strip().toLowerCase(Locale.ROOT));
  }
}
