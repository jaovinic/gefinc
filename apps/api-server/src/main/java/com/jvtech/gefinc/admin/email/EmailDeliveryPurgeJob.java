package com.jvtech.gefinc.admin.email;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Rotina diária que remove em lotes de {@link #BATCH_SIZE} os envios com mais de 90 dias de {@code
 * email_deliveries}. Não toca em {@code pending_communications}. Sem {@code @Transactional} em
 * {@link #run()}: cada lote confirma em transação própria, e uma falha no meio preserva os lotes já
 * removidos.
 */
@Component
public class EmailDeliveryPurgeJob {

  static final Duration RETENTION = Duration.ofDays(90);
  static final int BATCH_SIZE = 5000;

  private static final Logger log = LoggerFactory.getLogger(EmailDeliveryPurgeJob.class);

  private final EmailDeliveryRepository deliveries;
  private final Clock clock;

  public EmailDeliveryPurgeJob(EmailDeliveryRepository deliveries, Clock clock) {
    this.deliveries = deliveries;
    this.clock = clock;
  }

  @Scheduled(cron = "0 30 4 * * *", zone = "America/Sao_Paulo")
  public int run() {
    Instant cutoff = clock.instant().minus(RETENTION);
    int total = 0;
    int deleted;
    do {
      deleted = deliveries.deleteBatchBefore(cutoff, BATCH_SIZE);
      total += deleted;
    } while (deleted == BATCH_SIZE);
    if (total > 0) {
      log.info("Envios de e-mail com mais de 90 dias removidos: {}", total);
    }
    return total;
  }
}
