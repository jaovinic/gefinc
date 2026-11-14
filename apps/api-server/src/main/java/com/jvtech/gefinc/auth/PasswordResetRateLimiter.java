package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.common.error.TooManyRequestsException;
import com.jvtech.gefinc.common.ratelimit.PerKeyRateLimiter;
import java.time.Clock;
import java.time.Duration;
import java.util.Locale;
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

  private final PerKeyRateLimiter requests;

  public PasswordResetRateLimiter(Clock clock) {
    this.requests = new PerKeyRateLimiter(clock, LIMIT, WINDOW);
  }

  /** Registra a solicitação ou lança {@link TooManyRequestsException} se o limite foi atingido. */
  public void acquire(String email) {
    requests.acquire(
        TokenService.hash(email.strip().toLowerCase(Locale.ROOT)),
        "Muitas solicitações de redefinição. Tente novamente mais tarde.");
  }

  /** Zera as contagens (usado pelos testes para isolar cenários). */
  public void clear() {
    requests.clear();
  }
}
