package com.jvtech.gefinc.common.mail;

import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Descarta o envio rejeitado pelo executor (fila cheia ou pool em encerramento) sem afetar a
 * resposta da API. Registra um aviso e conta o descarte; nunca loga a tarefa, que carrega o
 * destinatário e o link com o token.
 */
public class MailRejectedExecutionHandler implements RejectedExecutionHandler {

  private static final Logger log = LoggerFactory.getLogger(MailRejectedExecutionHandler.class);

  private final MailMetrics metrics;

  public MailRejectedExecutionHandler(MailMetrics metrics) {
    this.metrics = metrics;
  }

  @Override
  public void rejectedExecution(Runnable task, ThreadPoolExecutor pool) {
    if (pool.isShutdown()) {
      metrics.dropped(MailMetrics.DropReason.SHUTDOWN);
      log.warn(
          "E-mail descartado: servidor em encerramento. Se era uma redefinição de senha, o usuário"
              + " precisa solicitar novamente");
    } else {
      metrics.dropped(MailMetrics.DropReason.QUEUE_FULL);
      log.warn(
          "E-mail descartado: fila de envio cheia ({} aguardando). O usuário precisa solicitar"
              + " novamente",
          pool.getQueue().size());
    }
  }
}
