package com.jvtech.gefinc.transaction;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Rotina diária que completa a janela de 12 meses das ocorrências dos lançamentos fixos. É
 * idempotente (a unicidade por grupo e mês impede duplicatas) e ignora grupos encerrados e contas
 * inativas.
 */
@Component
public class FixedRecurrenceJob {

  private static final Logger log = LoggerFactory.getLogger(FixedRecurrenceJob.class);

  private final TransactionGroupService service;

  public FixedRecurrenceJob(TransactionGroupService service) {
    this.service = service;
  }

  @Scheduled(cron = "0 30 3 * * *", zone = "America/Sao_Paulo")
  public void run() {
    int created = topUp();
    if (created > 0) {
      log.info("Ocorrências fixas geradas: {}", created);
    }
  }

  /** Completa as ocorrências e devolve quantas foram criadas. */
  public int topUp() {
    return service.topUpFixed();
  }
}
