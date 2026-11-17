package com.jvtech.gefinc.admin.email;

import com.jvtech.gefinc.common.mail.MailDeliveryListener;
import com.jvtech.gefinc.common.mail.MailOutcome;
import com.jvtech.gefinc.common.mail.OutgoingMail;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Grava o resultado final de cada envio no histórico, de forma síncrona na própria thread do envio
 * (por isso é drenado junto com o executor de e-mail nos testes), em transação própria ({@code
 * REQUIRES_NEW}): nem o rollback da ação que originou o e-mail apaga o registro, nem uma falha do
 * registro afeta o envio, que já saiu. A falha do registro é logada só com a classe da exceção,
 * porque a mensagem poderia conter o endereço.
 */
@Component
public class EmailDeliveryRecorder implements MailDeliveryListener {

  private static final Logger log = LoggerFactory.getLogger(EmailDeliveryRecorder.class);

  private final EmailDeliveryRepository repository;
  private final Pseudonymizer pseudonymizer;
  private final Clock clock;
  private final TransactionTemplate transaction;

  public EmailDeliveryRecorder(
      EmailDeliveryRepository repository,
      Pseudonymizer pseudonymizer,
      Clock clock,
      PlatformTransactionManager transactionManager) {
    this.repository = repository;
    this.pseudonymizer = pseudonymizer;
    this.clock = clock;
    this.transaction = new TransactionTemplate(transactionManager);
    this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  @Override
  public void onDelivery(OutgoingMail mail, MailOutcome outcome) {
    try {
      EmailDelivery delivery =
          new EmailDelivery(
              clock.instant(),
              mail.kind(),
              mail.to(),
              pseudonymizer.emailRef(mail.to()),
              mail.userId(),
              outcome.sent(),
              outcome.reason(),
              outcome.attempts());
      transaction.executeWithoutResult(status -> repository.save(delivery));
    } catch (RuntimeException e) {
      log.error(
          "Falha ao registrar o histórico de envio de e-mail: {}", e.getClass().getSimpleName());
    }
  }
}
