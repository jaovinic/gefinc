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
 * Limita as solicitações de redefinição por e-mail (3 por hora), igualmente para e-mails
 * cadastrados ou não, para que o {@code 429} não revele quais contas existem. O controle fica em
 * memória: a API roda em uma única instância e reiniciá-la apenas zera as contagens.
 */
@Component
public class PasswordResetRateLimiter {

  static final int LIMIT = 3;
  static final Duration WINDOW = Duration.ofHours(1);
  private static final int PRUNE_THRESHOLD = 10_000;

  private final Clock clock;
  private final Map<String, Deque<Instant>> requests = new HashMap<>();

  public PasswordResetRateLimiter(Clock clock) {
    this.clock = clock;
  }

  /** Registra a solicitação ou lança {@link TooManyRequestsException} se o limite foi atingido. */
  public synchronized void acquire(String email) {
    Instant now = clock.instant();
    if (requests.size() > PRUNE_THRESHOLD) {
      requests.values().removeIf(window -> expired(window, now));
    }
    String key = TokenService.hash(email.strip().toLowerCase(Locale.ROOT));
    Deque<Instant> window = requests.computeIfAbsent(key, k -> new ArrayDeque<>());
    while (!window.isEmpty() && !window.peekFirst().plus(WINDOW).isAfter(now)) {
      window.pollFirst();
    }
    if (window.size() >= LIMIT) {
      long retryAfter = Duration.between(now, window.peekFirst().plus(WINDOW)).toSeconds() + 1;
      throw new TooManyRequestsException(
          "Muitas solicitações de redefinição. Tente novamente mais tarde.", retryAfter);
    }
    window.addLast(now);
  }

  /** Zera as contagens (usado pelos testes para isolar cenários). */
  public synchronized void clear() {
    requests.clear();
  }

  private static boolean expired(Deque<Instant> window, Instant now) {
    return window.isEmpty() || !window.peekLast().plus(WINDOW).isAfter(now);
  }
}
