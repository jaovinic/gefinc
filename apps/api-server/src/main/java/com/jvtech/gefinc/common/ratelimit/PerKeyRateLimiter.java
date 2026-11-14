package com.jvtech.gefinc.common.ratelimit;

import com.jvtech.gefinc.common.error.TooManyRequestsException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;

/**
 * Janela deslizante em memória: no máximo {@code limit} ocorrências por chave em {@code window}.
 * Não guarda dados pessoais: quem chama passa a chave já derivada (hash, id). O estado fica em uma
 * única instância da API e reiniciá-la apenas zera as contagens.
 */
public final class PerKeyRateLimiter {

  private static final int PRUNE_THRESHOLD = 10_000;

  private final Clock clock;
  private final int limit;
  private final Duration window;
  private final Map<String, Deque<Instant>> events = new HashMap<>();

  public PerKeyRateLimiter(Clock clock, int limit, Duration window) {
    this.clock = clock;
    this.limit = limit;
    this.window = window;
  }

  /**
   * Segundos até a chave poder agir de novo (0 se está abaixo do limite). Segue a fórmula do {@code
   * Retry-After}: segundos até liberar mais um.
   */
  public synchronized long secondsUntilFree(String key) {
    Deque<Instant> deque = events.get(key);
    if (deque == null) {
      return 0;
    }
    Instant now = clock.instant();
    trim(deque, now);
    if (deque.size() < limit) {
      return 0;
    }
    return Duration.between(now, deque.peekFirst().plus(window)).toSeconds() + 1;
  }

  public synchronized void record(String key) {
    Instant now = clock.instant();
    if (events.size() > PRUNE_THRESHOLD) {
      events.values().removeIf(deque -> expired(deque, now));
    }
    events.computeIfAbsent(key, k -> new ArrayDeque<>()).addLast(now);
  }

  /** Registra a ocorrência ou lança {@link TooManyRequestsException} se o limite foi atingido. */
  public synchronized void acquire(String key, String message) {
    long wait = secondsUntilFree(key);
    if (wait > 0) {
      throw new TooManyRequestsException(message, wait);
    }
    record(key);
  }

  /** Ocorrências da chave dentro da janela. */
  public synchronized int count(String key) {
    Deque<Instant> deque = events.get(key);
    if (deque == null) {
      return 0;
    }
    trim(deque, clock.instant());
    return deque.size();
  }

  public synchronized void reset(String key) {
    events.remove(key);
  }

  /** Zera tudo (usado pelos testes para isolar cenários). */
  public synchronized void clear() {
    events.clear();
  }

  synchronized int trackedKeys() {
    return events.size();
  }

  private void trim(Deque<Instant> deque, Instant now) {
    while (!deque.isEmpty() && !deque.peekFirst().plus(window).isAfter(now)) {
      deque.pollFirst();
    }
  }

  private boolean expired(Deque<Instant> deque, Instant now) {
    return deque.isEmpty() || !deque.peekLast().plus(window).isAfter(now);
  }
}
