package com.jvtech.gefinc.common.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Envia o e-mail de redefinição somente após o commit da transação que gravou o token, fora da
 * thread da requisição e em executor dedicado e limitado. Com transação ativa, rollback não envia;
 * sem transação ativa, {@code fallbackExecution} envia na hora em vez de descartar o evento em
 * silêncio.
 */
@Component
public class PasswordResetMailListener {

  private static final Logger log = LoggerFactory.getLogger(PasswordResetMailListener.class);

  private final MailService mail;

  public PasswordResetMailListener(MailService mail) {
    this.mail = mail;
  }

  @Async("mailExecutor")
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
  public void on(PasswordResetMailRequested event) {
    try {
      mail.sendPasswordReset(event.to(), event.link(), event.userId());
    } catch (RuntimeException e) {
      // Sem a mensagem da exceção: ela poderia conter o destinatário ou o link.
      log.error(
          "Falha inesperada ao processar e-mail de redefinição de senha: {}",
          e.getClass().getSimpleName());
    }
  }
}
