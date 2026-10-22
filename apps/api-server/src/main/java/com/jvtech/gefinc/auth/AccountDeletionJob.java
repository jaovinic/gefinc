package com.jvtech.gefinc.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Rotina diária que conclui as exclusões de conta cuja carência terminou. */
@Component
public class AccountDeletionJob {

  private static final Logger log = LoggerFactory.getLogger(AccountDeletionJob.class);

  private final AccountDeletionService service;

  public AccountDeletionJob(AccountDeletionService service) {
    this.service = service;
  }

  @Scheduled(cron = "0 0 3 * * *", zone = "America/Sao_Paulo")
  public void run() {
    int deleted = service.deleteExpired();
    if (deleted > 0) {
      log.info("Contas excluídas definitivamente: {}", deleted);
    }
  }
}
