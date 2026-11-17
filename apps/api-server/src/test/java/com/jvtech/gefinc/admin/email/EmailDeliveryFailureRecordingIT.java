package com.jvtech.gefinc.admin.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.jvtech.gefinc.common.mail.MailKind;
import com.jvtech.gefinc.common.mail.MailService;
import com.jvtech.gefinc.common.mail.PasswordResetMailRequested;
import com.jvtech.gefinc.support.IntegrationTestBase;
import java.net.SocketTimeoutException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import org.eclipse.angus.mail.smtp.SMTPSendFailedException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * Falhas de envio viram linhas FAILED com o motivo certo, e uma falha do próprio registro nunca
 * impede o envio nem muda o resultado (o e-mail já saiu).
 */
class EmailDeliveryFailureRecordingIT extends IntegrationTestBase {

  private static final String EMAIL = "ana@example.com";

  @MockitoBean private JavaMailSenderImpl sender;
  @MockitoSpyBean private EmailDeliveryRepository repository;
  @Autowired private ApplicationEventPublisher publisher;

  private ListAppender<ILoggingEvent> appender;
  private Logger recorderLogger;
  private Logger mailLogger;

  @BeforeEach
  void captureLogs() {
    appender = new ListAppender<>();
    appender.list = new CopyOnWriteArrayList<>();
    appender.start();
    recorderLogger = (Logger) LoggerFactory.getLogger(EmailDeliveryRecorder.class);
    mailLogger = (Logger) LoggerFactory.getLogger(MailService.class);
    recorderLogger.addAppender(appender);
    mailLogger.addAppender(appender);
  }

  @AfterEach
  void releaseLogs() {
    recorderLogger.detachAppender(appender);
    mailLogger.detachAppender(appender);
  }

  private void send() {
    publisher.publishEvent(new PasswordResetMailRequested(EMAIL, "http://x/?token=segredo", null));
  }

  private Map<String, Object> awaitRow() {
    await()
        .atMost(Duration.ofSeconds(10))
        .until(
            () -> jdbc.queryForObject("SELECT count(*) FROM email_deliveries", Integer.class) == 1);
    return jdbc.queryForMap("SELECT * FROM email_deliveries");
  }

  @Test
  void falhaDeAutenticacaoViraFailedAuthentication() {
    doThrow(new MailAuthenticationException("credencial recusada"))
        .when(sender)
        .send(any(SimpleMailMessage.class));

    send();

    assertThat(awaitRow())
        .containsEntry("status", "FAILED")
        .containsEntry("failure_reason", "AUTHENTICATION")
        .containsEntry("attempts", 1)
        .containsEntry("kind", MailKind.PASSWORD_RESET.name())
        .containsEntry("recipient_email", EMAIL);
  }

  @Test
  void rejeicaoPermanente5xxViraPermanentRejection() {
    SMTPSendFailedException cause =
        new SMTPSendFailedException("DATA", 554, "rejeitado", null, null, null, null);
    doThrow(new MailSendException("falha", cause)).when(sender).send(any(SimpleMailMessage.class));

    send();

    assertThat(awaitRow())
        .containsEntry("failure_reason", "PERMANENT_REJECTION")
        .containsEntry("attempts", 1);
  }

  @Test
  void falhaTransitoriaPersistenteViraTransientExhaustedComTresTentativas() {
    doThrow(new MailSendException("conexao recusada"))
        .when(sender)
        .send(any(SimpleMailMessage.class));

    send();

    assertThat(awaitRow())
        .containsEntry("failure_reason", "TRANSIENT_EXHAUSTED")
        .containsEntry("attempts", 3);
  }

  @Test
  void timeoutViraTimeout() {
    doThrow(new MailSendException("falha", new SocketTimeoutException("Read timed out")))
        .when(sender)
        .send(any(SimpleMailMessage.class));

    send();

    assertThat(awaitRow()).containsEntry("failure_reason", "TIMEOUT");
  }

  @Test
  void falhaQueSeRecuperaGravaEnviadoComAsTentativas() {
    doThrow(new MailSendException("conexao recusada"))
        .doNothing()
        .when(sender)
        .send(any(SimpleMailMessage.class));

    send();

    assertThat(awaitRow()).containsEntry("status", "SENT").containsEntry("attempts", 2);
  }

  @Test
  void falhaDoRegistroNaoImpedeOEnvioNemVazaDados() {
    doNothing().when(sender).send(any(SimpleMailMessage.class));
    doThrow(new IllegalStateException("banco indisponivel para " + EMAIL))
        .when(repository)
        .save(any(EmailDelivery.class));

    send();

    verify(sender, timeout(5000)).send(any(SimpleMailMessage.class));
    awaitPendingMails();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM email_deliveries", Integer.class))
        .isZero();
    List<ILoggingEvent> errors =
        appender.list.stream().filter(e -> e.getLevel() == Level.ERROR).toList();
    assertThat(errors).isNotEmpty();
    assertThat(appender.list)
        .allSatisfy(
            e -> {
              assertThat(e.getFormattedMessage()).doesNotContain(EMAIL).doesNotContain("segredo");
              assertThat(e.getThrowableProxy()).isNull();
            });
  }
}
