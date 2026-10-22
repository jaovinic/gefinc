package com.jvtech.gefinc.idempotency;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Rotina diária que apaga as chaves de idempotência com mais de 7 dias. */
@Component
public class IdempotencyCleanupJob {

  private static final Logger log = LoggerFactory.getLogger(IdempotencyCleanupJob.class);

  private final IdempotencyService service;

  public IdempotencyCleanupJob(IdempotencyService service) {
    this.service = service;
  }

  @Scheduled(cron = "0 30 3 * * *", zone = "America/Sao_Paulo")
  public int purgeExpired() {
    int removed = service.purgeExpired();
    if (removed > 0) {
      log.info("Chaves de idempotência expiradas removidas: {}", removed);
    }
    return removed;
  }
}
