package com.jvtech.gefinc.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.jvtech.gefinc.common.mail.MailService;
import com.jvtech.gefinc.common.mail.PasswordResetMailRequested;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Entrega assíncrona pós-commit do e-mail de redefinição, com o {@link JavaMailSenderImpl}
 * simulado: permite controlar atrasos e falhas sem derrubar o SMTP compartilhado dos demais testes.
 */
class PasswordResetMailDeliveryIT extends IntegrationTestBase {

  private static final String EMAIL = "ana@example.com";

  @MockitoBean private JavaMailSenderImpl sender;
  @Autowired private PasswordResetService service;
  @Autowired private PlatformTransactionManager transactionManager;
  @Autowired private ApplicationEventPublisher publisher;

  private ListAppender<ILoggingEvent> appender;
  private Logger mailLogger;

  @BeforeEach
  void init() throws Exception {
    new TestUsers(mockMvc, objectMapper).registerAndLogin(EMAIL);
    mailLogger = (Logger) LoggerFactory.getLogger(MailService.class);
    appender = new ListAppender<>();
    appender.list = new CopyOnWriteArrayList<>();
    appender.start();
    mailLogger.addAppender(appender);
  }

  @AfterEach
  void releaseLogs() {
    mailLogger.detachAppender(appender);
  }

  private void requestReset() throws Exception {
    mockMvc
        .perform(
            post("/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", EMAIL))))
        .andExpect(status().isAccepted());
  }

  private List<ILoggingEvent> errors() {
    return appender.list.stream().filter(e -> e.getLevel() == Level.ERROR).toList();
  }

  @Test
  void naoEnviaNadaQuandoATransacaoDaSolicitacaoFazRollback() {
    new TransactionTemplate(transactionManager)
        .executeWithoutResult(
            status -> {
              service.request(EMAIL);
              status.setRollbackOnly();
            });

    await()
        .during(Duration.ofMillis(500))
        .atMost(Duration.ofSeconds(3))
        .untilAsserted(() -> verifyNoInteractions(sender));
    assertThat(jdbc.queryForObject("SELECT count(*) FROM password_reset_tokens", Integer.class))
        .isZero();
  }

  @Test
  void enviaDepoisDoCommitQuandoATransacaoExternaConfirma() {
    new TransactionTemplate(transactionManager)
        .executeWithoutResult(status -> service.request(EMAIL));

    verify(sender, timeout(5000)).send(any(SimpleMailMessage.class));
  }

  @Test
  void comTransacaoAtivaSoEnviaDepoisDoCommit() {
    new TransactionTemplate(transactionManager)
        .executeWithoutResult(
            status -> {
              publisher.publishEvent(new PasswordResetMailRequested(EMAIL, "http://x/?token=t"));
              // Ainda dentro da transação: nada pode ter sido enviado.
              await()
                  .during(Duration.ofMillis(300))
                  .atMost(Duration.ofSeconds(3))
                  .untilAsserted(() -> verifyNoInteractions(sender));
            });

    verify(sender, timeout(5000)).send(any(SimpleMailMessage.class));
  }

  @Test
  void semTransacaoAtivaEnviaNaHoraEmVezDeDescartarOEvento() {
    publisher.publishEvent(new PasswordResetMailRequested(EMAIL, "http://x/?token=t"));

    verify(sender, timeout(5000)).send(any(SimpleMailMessage.class));
  }

  @Test
  void respondeSemEsperarOSmtpLento() throws Exception {
    CountDownLatch started = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    doAnswer(
            invocation -> {
              started.countDown();
              release.await(15, TimeUnit.SECONDS);
              return null;
            })
        .when(sender)
        .send(any(SimpleMailMessage.class));

    try {
      long begin = System.nanoTime();
      requestReset();
      Duration elapsed = Duration.ofNanos(System.nanoTime() - begin);

      // O envio segue preso no SMTP "lento", mas a resposta 202 já voltou.
      assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
      assertThat(elapsed).isLessThan(Duration.ofSeconds(5));
    } finally {
      release.countDown();
    }
    verify(sender, timeout(5000)).send(any(SimpleMailMessage.class));
  }

  @Test
  void reTentaFalhaTransitoriaEEntregaNaTerceiraTentativa() throws Exception {
    doThrow(new MailSendException("conexao recusada"))
        .doThrow(new MailSendException("conexao recusada"))
        .doNothing()
        .when(sender)
        .send(any(SimpleMailMessage.class));

    requestReset();

    verify(sender, timeout(5000).times(3)).send(any(SimpleMailMessage.class));
    assertThat(errors()).isEmpty();
  }

  @Test
  void naoReTentaFalhaDeAutenticacaoERegistraSemDadosPessoais() throws Exception {
    doThrow(new MailAuthenticationException("credencial recusada para " + EMAIL))
        .when(sender)
        .send(any(SimpleMailMessage.class));

    requestReset();

    await().atMost(Duration.ofSeconds(5)).until(() -> !errors().isEmpty());
    await()
        .during(Duration.ofMillis(300))
        .atMost(Duration.ofSeconds(3))
        .untilAsserted(() -> verify(sender, times(1)).send(any(SimpleMailMessage.class)));
    assertThat(errors()).hasSize(1);
    assertThat(errors().get(0).getFormattedMessage())
        .contains("MailAuthenticationException")
        .doesNotContain(EMAIL);
  }

  @Test
  void falhaPersistenteEsgotaAsTentativasRegistraUmErroEContinuaResponde202() throws Exception {
    doThrow(new MailSendException("indisponivel")).when(sender).send(any(SimpleMailMessage.class));

    requestReset();

    verify(sender, timeout(5000).times(3)).send(any(SimpleMailMessage.class));
    await().atMost(Duration.ofSeconds(5)).until(() -> !errors().isEmpty());
    assertThat(errors()).hasSize(1);
    assertThat(errors().get(0).getFormattedMessage())
        .contains("MailSendException", "3 tentativa(s)")
        .doesNotContain(EMAIL);
  }

  @Test
  void contaInexistenteNaoDisparaEnvio() throws Exception {
    mockMvc
        .perform(
            post("/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", "ninguem@example.com"))))
        .andExpect(status().isAccepted());

    await()
        .during(Duration.ofMillis(300))
        .atMost(Duration.ofSeconds(3))
        .untilAsserted(() -> verifyNoInteractions(sender));
  }
}
