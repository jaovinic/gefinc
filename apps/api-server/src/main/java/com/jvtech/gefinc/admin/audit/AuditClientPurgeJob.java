package com.jvtech.gefinc.admin.audit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Rotina diária que remove em lotes de {@link #BATCH_SIZE} os registros de IP e dispositivo de
 * visitantes ({@code user_id IS NULL}) com mais de 90 dias em {@code audit_log_client}. Não há
 * {@code @Transactional} no método {@link #run()}: cada lote confirma em transação própria no
 * repositório, de modo que uma falha no meio preserva os lotes já removidos.
 */
@Component
public class AuditClientPurgeJob {

  static final Duration RETENTION = Duration.ofDays(90);
  static final int BATCH_SIZE = 5000;

  private static final Logger log = LoggerFactory.getLogger(AuditClientPurgeJob.class);

  private final AuditLogClientRepository clients;
  private final Clock clock;

  public AuditClientPurgeJob(AuditLogClientRepository clients, Clock clock) {
    this.clients = clients;
    this.clock = clock;
  }

  @Scheduled(cron = "0 15 4 * * *", zone = "America/Sao_Paulo")
  public int run() {
    Instant cutoff = clock.instant().minus(RETENTION);
    int total = 0;
    int deleted;
    do {
      deleted = clients.deleteVisitorBatchBefore(cutoff, BATCH_SIZE);
      total += deleted;
    } while (deleted == BATCH_SIZE);
    if (total > 0) {
      log.info("Origens de visitantes com mais de 90 dias removidas: {}", total);
    }
    return total;
  }
}
