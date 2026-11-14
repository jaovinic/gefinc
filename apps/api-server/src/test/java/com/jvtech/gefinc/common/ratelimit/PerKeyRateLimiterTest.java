package com.jvtech.gefinc.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jvtech.gefinc.common.error.TooManyRequestsException;
import com.jvtech.gefinc.support.MutableClock;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class PerKeyRateLimiterTest {

  private static final Duration WINDOW = Duration.ofMinutes(15);

  private final MutableClock clock = new MutableClock(Instant.parse("2026-11-10T15:00:00Z"));
  private final PerKeyRateLimiter limiter = new PerKeyRateLimiter(clock, 3, WINDOW);

  @Test
  void abaixoDoLimiteNaoEspera() {
    limiter.record("a");
    limiter.record("a");

    assertThat(limiter.secondsUntilFree("a")).isZero();
    assertThat(limiter.count("a")).isEqualTo(2);
  }

  @Test
  void blockedUntilSoInformaNoLimiteENaoRegistraNada() {
    limiter.record("a");
    limiter.record("a");
    assertThat(limiter.blockedUntil("a")).isEmpty();
    assertThat(limiter.blockedUntil("outra")).isEmpty();

    Instant first = clock.instant();
    limiter.record("a");

    assertThat(limiter.blockedUntil("a")).contains(first.plus(WINDOW));
    assertThat(limiter.count("a")).isEqualTo(3);
    clock.advance(WINDOW);
    assertThat(limiter.blockedUntil("a")).isEmpty();
  }

  @Test
  void noLimiteInformaOsSegundosAteLiberarMaisUm() {
    limiter.record("a");
    clock.advance(Duration.ofMinutes(1));
    limiter.record("a");
    limiter.record("a");

    // O registro mais antigo sai da janela em 14 min; Retry-After = segundos até liberar + 1.
    assertThat(limiter.secondsUntilFree("a")).isEqualTo(Duration.ofMinutes(14).toSeconds() + 1);
  }

  @Test
  void janelaDeslizanteLiberaAoSairOMaisAntigo() {
    limiter.record("a");
    clock.advance(Duration.ofMinutes(5));
    limiter.record("a");
    limiter.record("a");
    assertThat(limiter.secondsUntilFree("a")).isPositive();

    clock.advance(Duration.ofMinutes(10));

    assertThat(limiter.secondsUntilFree("a")).isZero();
    assertThat(limiter.count("a")).isEqualTo(2);
  }

  @Test
  void chavesSaoIndependentes() {
    for (int i = 0; i < 3; i++) {
      limiter.record("a");
    }

    assertThat(limiter.secondsUntilFree("a")).isPositive();
    assertThat(limiter.secondsUntilFree("b")).isZero();
    assertThat(limiter.count("b")).isZero();
  }

  @Test
  void acquireRegistraAteOLimiteEDepoisLancaComRetryAfter() {
    limiter.acquire("a", "Muitas.");
    limiter.acquire("a", "Muitas.");
    limiter.acquire("a", "Muitas.");

    assertThatThrownBy(() -> limiter.acquire("a", "Muitas."))
        .isInstanceOfSatisfying(
            TooManyRequestsException.class,
            e -> {
              assertThat(e.getMessage()).isEqualTo("Muitas.");
              assertThat(e.retryAfterSeconds()).isEqualTo(WINDOW.toSeconds() + 1);
            });
    assertThat(limiter.count("a")).isEqualTo(3);
  }

  @Test
  void acquireRecusadoNaoEstendeAJanela() {
    for (int i = 0; i < 3; i++) {
      limiter.acquire("a", "x");
    }
    clock.advance(Duration.ofMinutes(10));
    assertThatCode(() -> limiter.acquire("a", "x")).isInstanceOf(TooManyRequestsException.class);

    clock.advance(Duration.ofMinutes(5).plusSeconds(1));

    assertThatCode(() -> limiter.acquire("a", "x")).doesNotThrowAnyException();
  }

  @Test
  void resetZeraSoAQuelaChave() {
    limiter.record("a");
    limiter.record("b");

    limiter.reset("a");

    assertThat(limiter.count("a")).isZero();
    assertThat(limiter.count("b")).isEqualTo(1);
    assertThatCode(() -> limiter.reset("inexistente")).doesNotThrowAnyException();
  }

  @Test
  void clearZeraTudo() {
    limiter.record("a");
    limiter.record("b");

    limiter.clear();

    assertThat(limiter.count("a")).isZero();
    assertThat(limiter.trackedKeys()).isZero();
  }

  @Test
  void podaAsChavesExpiradasAcimaDoLimiar() {
    for (int i = 0; i < 10_001; i++) {
      limiter.record("antiga-" + i);
    }
    assertThat(limiter.trackedKeys()).isEqualTo(10_001);

    clock.advance(WINDOW.plusSeconds(1));
    limiter.record("nova");

    assertThat(limiter.trackedKeys()).isEqualTo(1);
    assertThat(limiter.count("nova")).isEqualTo(1);
  }

  @Test
  void naoPodaChavesAindaDentroDaJanela() {
    for (int i = 0; i < 10_001; i++) {
      limiter.record("viva-" + i);
    }

    limiter.record("nova");

    assertThat(limiter.trackedKeys()).isEqualTo(10_002);
  }

  @Test
  void contagemDeChaveInexistenteNaoCriaEntrada() {
    assertThat(limiter.count("fantasma")).isZero();
    assertThat(limiter.secondsUntilFree("fantasma")).isZero();
    assertThat(limiter.trackedKeys()).isZero();
  }
}
