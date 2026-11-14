package com.jvtech.gefinc.auth;

import java.time.Clock;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Rotina diária que remove as sessões expiradas ou encerradas há mais de 30 dias. Sessões abertas,
 * encerradas há menos tempo e os tokens de renovação não são tocados.
 */
@Component
public class AuthSessionCleanupJob {

  static final Duration RETENTION = Duration.ofDays(30);

  private static final Logger log = LoggerFactory.getLogger(AuthSessionCleanupJob.class);

  private final AuthSessionRepository sessions;
  private final Clock clock;

  public AuthSessionCleanupJob(AuthSessionRepository sessions, Clock clock) {
    this.sessions = sessions;
    this.clock = clock;
  }

  @Scheduled(cron = "0 30 3 * * *", zone = "America/Sao_Paulo")
  public void run() {
    int removed = sessions.deleteInactiveBefore(clock.instant().minus(RETENTION));
    if (removed > 0) {
      log.info("Sessões de autenticação antigas removidas: {}", removed);
    }
  }
}
