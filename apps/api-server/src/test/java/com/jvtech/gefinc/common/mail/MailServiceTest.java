package com.jvtech.gefinc.common.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.icegreen.greenmail.configuration.GreenMailConfiguration;
import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;
import com.jvtech.gefinc.common.config.AppProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntFunction;
import org.eclipse.angus.mail.smtp.SMTPAddressFailedException;
import org.eclipse.angus.mail.smtp.SMTPSendFailedException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.mail.MailSenderAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

/**
 * Envio de e-mail contra um SMTP real (GreenMail) com autenticação, usando o {@code
 * application.yml} de produção para montar o {@link JavaMailSender}: o que a configuração mapeia
 * das variáveis SMTP_* é o que vai para o servidor.
 */
class MailServiceTest {

  private static final String LOGIN = "login-smtp-de-teste";
  private static final String SENHA = "chave-smtp-de-teste";
  private static final String DESTINATARIO = "ana.destino@example.com";
  private static final String REMETENTE = "nao-responda@mail.example.com";
  private static final String LINK = "http://localhost:4200/reset-password?token=abc";

  @RegisterExtension
  static final GreenMailExtension GREEN_MAIL =
      new GreenMailExtension(ServerSetupTest.SMTP.dynamicPort())
          .withConfiguration(GreenMailConfiguration.aConfig().withUser(LOGIN, SENHA));

  private ListAppender<ILoggingEvent> appender;
  private Logger mailLogger;

  @BeforeEach
  void captureLogs() {
    mailLogger = (Logger) LoggerFactory.getLogger(MailService.class);
    appender = new ListAppender<>();
    appender.start();
    mailLogger.addAppender(appender);
  }

  @AfterEach
  void releaseLogs() {
    mailLogger.detachAppender(appender);
  }

  private void withSender(String[] properties, SenderConsumer test) throws Exception {
    String[] base = {
      "SMTP_HOST=localhost", "SMTP_PORT=" + GREEN_MAIL.getSmtp().getPort(),
    };
    String[] all = new String[base.length + properties.length];
    System.arraycopy(base, 0, all, 0, base.length);
    System.arraycopy(properties, 0, all, base.length, properties.length);
    new ApplicationContextRunner()
        .withInitializer(new ConfigDataApplicationContextInitializer())
        .withConfiguration(AutoConfigurations.of(MailSenderAutoConfiguration.class))
        .withPropertyValues(all)
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              try {
                test.accept(context.getBean(JavaMailSenderImpl.class));
              } catch (Exception e) {
                throw new IllegalStateException(e);
              }
            });
  }

  private final SimpleMeterRegistry registry = new SimpleMeterRegistry();

  private MailService service(JavaMailSender sender) {
    return service(sender, REMETENTE);
  }

  private MailService service(
      JavaMailSender sender, String from, MailDeliveryListener... listeners) {
    return new MailService(
        sender,
        new AppProperties("America/Sao_Paulo", "http://localhost:4200", from, null, null, null),
        3,
        Duration.ofMillis(10),
        new MailMetrics(registry),
        List.of(listeners));
  }

  private static OutgoingMail mail(MailKind kind) {
    return new OutgoingMail(kind, DESTINATARIO, "GEFINC: assunto", "Corpo " + LINK, 7L);
  }

  /** Ouvinte que guarda cada chamada. */
  private static final class RecordingListener implements MailDeliveryListener {
    final List<OutgoingMail> mails = new java.util.ArrayList<>();
    final List<MailOutcome> outcomes = new java.util.ArrayList<>();

    @Override
    public void onDelivery(OutgoingMail mail, MailOutcome outcome) {
      mails.add(mail);
      outcomes.add(outcome);
    }
  }

  private double failures(String reason) {
    return registry.counter(MailMetrics.FAILED, "reason", reason).count();
  }

  private static MailSendException rejectedWith(int code) {
    try {
      SMTPAddressFailedException cause =
          new SMTPAddressFailedException(
              new InternetAddress(DESTINATARIO), "RCPT TO", code, "rejeitado");
      return new MailSendException("falha", cause);
    } catch (AddressException e) {
      throw new IllegalStateException(e);
    }
  }

  private static MailSendException sendFailedWith(int code) {
    SMTPSendFailedException cause =
        new SMTPSendFailedException("DATA", code, "resposta do servidor", null, null, null, null);
    return new MailSendException("falha", cause);
  }

  /** Sender que falha conforme o número da tentativa (1, 2, ...) e conta as chamadas. */
  private static class ScriptedSender extends JavaMailSenderImpl {
    final AtomicInteger attempts = new AtomicInteger();
    private final IntFunction<MailException> failureFor;

    ScriptedSender(IntFunction<MailException> failureFor) {
      this.failureFor = failureFor;
    }

    @Override
    public void send(SimpleMailMessage message) {
      MailException failure = failureFor.apply(attempts.incrementAndGet());
      if (failure != null) {
        throw failure;
      }
    }
  }

  private List<String> logs() {
    return appender.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
  }

  private List<String> errors() {
    return appender.list.stream()
        .filter(event -> event.getLevel() == Level.ERROR)
        .map(ILoggingEvent::getFormattedMessage)
        .toList();
  }

  @Test
  void enviaAutenticadoQuandoLoginESenhaForemInformados() throws Exception {
    withSender(
        new String[] {"SMTP_USER=" + LOGIN, "SMTP_PASSWORD=" + SENHA, "SMTP_AUTH=true"},
        sender -> {
          service(sender).sendPasswordReset(DESTINATARIO, LINK);

          assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
          MimeMessage message = GREEN_MAIL.getReceivedMessages()[0];
          assertThat(message.getAllRecipients()[0].toString()).isEqualTo(DESTINATARIO);
          assertThat(message.getFrom()[0].toString()).isEqualTo(REMETENTE);
          assertThat(String.valueOf(message.getContent())).contains(LINK);
        });
    assertThat(logs()).isEmpty();
  }

  @Test
  void naoPropagaERegistraAFalhaQuandoACredencialForRecusada() throws Exception {
    withSender(
        new String[] {"SMTP_USER=" + LOGIN, "SMTP_PASSWORD=senha-errada-123", "SMTP_AUTH=true"},
        sender ->
            assertThatCode(() -> service(sender).sendPasswordReset(DESTINATARIO, LINK))
                .doesNotThrowAnyException());

    assertThat(GREEN_MAIL.getReceivedMessages()).isEmpty();
    assertThat(logs()).hasSize(1);
    String log = errors().get(0);
    assertThat(log).contains("MailAuthenticationException");
    // A causa raiz (rejeição do servidor) permite diagnosticar sem abrir o stack trace.
    assertThat(log).contains("AuthenticationFailedException");
    assertThat(log)
        .doesNotContain(DESTINATARIO)
        .doesNotContain("senha-errada-123")
        .doesNotContain(SENHA)
        .doesNotContain(LOGIN);
    assertThat(appender.list.get(0).getThrowableProxy()).isNull();
  }

  @Test
  void registraAFalhaDeConexaoSemVazarODestinatario() throws Exception {
    withSender(
        new String[] {"SMTP_PORT=1"},
        sender -> {
          assertThatCode(() -> service(sender).sendPasswordReset(DESTINATARIO, LINK))
              .doesNotThrowAnyException();
        });

    assertThat(errors()).hasSize(1);
    assertThat(logs()).allSatisfy(l -> assertThat(l).doesNotContain(DESTINATARIO));
    assertThat(errors().get(0)).contains("MailSendException").contains("3 tentativa(s)");
  }

  @Test
  void removeEnderecosDeEmailDaMensagemDaCausa() throws Exception {
    // O servidor SMTP costuma devolver o endereço recusado na mensagem de erro.
    JavaMailSender recusa =
        new JavaMailSenderImpl() {
          @Override
          public void send(org.springframework.mail.SimpleMailMessage message) {
            throw new org.springframework.mail.MailSendException(
                "falha",
                new IllegalStateException(
                    "550 5.1.1 <" + DESTINATARIO + "> recusado pelo servidor"));
          }
        };

    service(recusa).sendPasswordReset(DESTINATARIO.toUpperCase(), LINK);

    assertThat(errors()).hasSize(1);
    assertThat(logs()).allSatisfy(l -> assertThat(l).doesNotContainIgnoringCase(DESTINATARIO));
    assertThat(errors().get(0))
        .contains("MailSendException")
        .contains("IllegalStateException")
        .contains("recusado pelo servidor")
        .doesNotContainIgnoringCase(DESTINATARIO);
  }

  @Test
  void aConfiguracaoPadraoNaoUsaAutenticacaoNemTlsParaOMailpitDeDesenvolvimento() throws Exception {
    withSender(
        new String[] {},
        sender -> {
          assertThat(sender.getUsername()).isNullOrEmpty();
          assertThat(sender.getJavaMailProperties())
              .containsEntry("mail.smtp.auth", "false")
              .containsEntry("mail.smtp.starttls.enable", "false")
              .containsEntry("mail.smtp.starttls.required", "false");

          service(sender).sendPasswordReset(DESTINATARIO, LINK);
          assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
        });
  }

  @Test
  void mapeiaBrevoComStartTlsObrigatorioETimeouts() throws Exception {
    withSender(
        new String[] {
          "SMTP_HOST=smtp-relay.brevo.com",
          "SMTP_PORT=587",
          "SMTP_USER=" + LOGIN,
          "SMTP_PASSWORD=" + SENHA,
          "SMTP_AUTH=true",
          "SMTP_STARTTLS=true"
        },
        sender -> {
          assertThat(sender.getHost()).isEqualTo("smtp-relay.brevo.com");
          assertThat(sender.getPort()).isEqualTo(587);
          assertThat(sender.getUsername()).isEqualTo(LOGIN);
          assertThat(sender.getJavaMailProperties())
              .containsEntry("mail.smtp.auth", "true")
              .containsEntry("mail.smtp.starttls.enable", "true")
              .containsEntry("mail.smtp.starttls.required", "true")
              .containsEntry("mail.smtp.connectiontimeout", "10000")
              .containsEntry("mail.smtp.timeout", "10000")
              .containsEntry("mail.smtp.writetimeout", "10000");
        });
  }

  @Test
  void exigirStartTlsImpedeEnviarCredenciaisAServidorSemTls() throws Exception {
    // O GreenMail não oferece STARTTLS: com SMTP_STARTTLS=true o envio deve falhar em vez de
    // seguir em texto puro com a chave SMTP.
    withSender(
        new String[] {
          "SMTP_USER=" + LOGIN, "SMTP_PASSWORD=" + SENHA, "SMTP_AUTH=true", "SMTP_STARTTLS=true"
        },
        sender -> service(sender).sendPasswordReset(DESTINATARIO, LINK));

    assertThat(GREEN_MAIL.getReceivedMessages()).isEmpty();
    assertThat(errors()).hasSize(1);
    assertThat(errors().get(0)).contains("MailSendException");
  }

  @Test
  void reTentaFalhaTransitoriaEEnviaNaTerceiraTentativa() {
    ScriptedSender sender =
        new ScriptedSender(n -> n < 3 ? new MailSendException("conexao recusada") : null);

    service(sender).sendPasswordReset(DESTINATARIO, LINK);

    assertThat(sender.attempts).hasValue(3);
    assertThat(errors()).isEmpty();
    assertThat(logs()).hasSize(2).allSatisfy(l -> assertThat(l).doesNotContain(DESTINATARIO));
  }

  @Test
  void desistePorTentativasEsgotadasEmFalhaTransitoriaPersistente() {
    ScriptedSender sender = new ScriptedSender(n -> new MailSendException("indisponivel"));

    assertThatCode(() -> service(sender).sendPasswordReset(DESTINATARIO, LINK))
        .doesNotThrowAnyException();

    assertThat(sender.attempts).hasValue(3);
    assertThat(errors()).hasSize(1);
    assertThat(errors().get(0)).contains("3 tentativa(s)");
  }

  @Test
  void naoReTentaFalhaDeAutenticacao() {
    ScriptedSender sender =
        new ScriptedSender(n -> new MailAuthenticationException("credencial recusada"));

    service(sender).sendPasswordReset(DESTINATARIO, LINK);

    assertThat(sender.attempts).hasValue(1);
    assertThat(logs()).hasSize(1);
    assertThat(errors().get(0)).contains("1 tentativa(s)").contains("MailAuthenticationException");
  }

  @Test
  void naoReTentaRejeicaoPermanenteDoDestinatario5xx() {
    ScriptedSender sender = new ScriptedSender(n -> rejectedWith(550));

    assertThatCode(() -> service(sender).sendPasswordReset(DESTINATARIO, LINK))
        .doesNotThrowAnyException();

    assertThat(sender.attempts).hasValue(1);
    assertThat(logs()).hasSize(1);
    assertThat(errors().get(0)).contains("1 tentativa(s)").contains("SMTPAddressFailedException");
    assertThat(logs()).allSatisfy(l -> assertThat(l).doesNotContain(DESTINATARIO));
    assertThat(failures("permanent_rejection")).isEqualTo(1);
  }

  @Test
  void naoReTentaRejeicaoPermanenteDoServidor5xx() {
    ScriptedSender sender = new ScriptedSender(n -> sendFailedWith(554));

    service(sender).sendPasswordReset(DESTINATARIO, LINK);

    assertThat(sender.attempts).hasValue(1);
    assertThat(errors()).hasSize(1);
    assertThat(failures("permanent_rejection")).isEqualTo(1);
  }

  @Test
  void reTentaRespostaTemporaria4xxDoServidor() {
    ScriptedSender sender = new ScriptedSender(n -> n < 3 ? sendFailedWith(451) : null);

    service(sender).sendPasswordReset(DESTINATARIO, LINK);

    assertThat(sender.attempts).hasValue(3);
    assertThat(errors()).isEmpty();
    assertThat(failures("permanent_rejection")).isZero();
    assertThat(failures("retries_exhausted")).isZero();
  }

  @Test
  void reTentaRecusaTemporariaDoDestinatario4xx() {
    ScriptedSender sender = new ScriptedSender(n -> n < 2 ? rejectedWith(450) : null);

    service(sender).sendPasswordReset(DESTINATARIO, LINK);

    assertThat(sender.attempts).hasValue(2);
    assertThat(errors()).isEmpty();
  }

  @Test
  void contaFalhaFinalPorMotivoSemRotuloComDadosPessoais() {
    service(new ScriptedSender(n -> new MailSendException("indisponivel")))
        .sendPasswordReset(DESTINATARIO, LINK);
    service(new ScriptedSender(n -> new MailAuthenticationException("recusada")))
        .sendPasswordReset(DESTINATARIO, LINK);

    assertThat(failures("retries_exhausted")).isEqualTo(1);
    assertThat(failures("authentication")).isEqualTo(1);
    assertThat(registry.getMeters())
        .allSatisfy(
            meter ->
                assertThat(meter.getId().getTags().toString())
                    .doesNotContain(DESTINATARIO)
                    .doesNotContain(LINK));
  }

  @Test
  void falhaTransitoriaQueSeRecuperaNaoContaComoFalha() {
    service(new ScriptedSender(n -> n < 2 ? new MailSendException("x") : null))
        .sendPasswordReset(DESTINATARIO, LINK);

    assertThat(registry.find(MailMetrics.FAILED).counters()).isEmpty();
  }

  @Test
  void sendDevolveOResultadoEnviadoComOTotalDeTentativas() {
    ScriptedSender sender =
        new ScriptedSender(n -> n < 3 ? new MailSendException("conexao recusada") : null);

    MailOutcome outcome = service(sender).send(mail(MailKind.TEST), DeliveryMode.WITH_RETRY);

    assertThat(outcome).isEqualTo(MailOutcome.sent(3));
    assertThat(outcome.sent()).isTrue();
    assertThat(outcome.reason()).isNull();
    assertThat(errors()).isEmpty();
  }

  @Test
  void enviaRealmenteOAssuntoEOCorpoDoEmailGenerico() throws Exception {
    withSender(
        new String[] {},
        sender -> {
          MailOutcome outcome =
              service(sender).send(mail(MailKind.INVITATION), DeliveryMode.SYNC_ONCE);

          assertThat(outcome.sent()).isTrue();
          assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
          MimeMessage message = GREEN_MAIL.getReceivedMessages()[0];
          assertThat(message.getSubject()).isEqualTo("GEFINC: assunto");
          assertThat(String.valueOf(message.getContent())).contains("Corpo " + LINK);
          assertThat(message.getFrom()[0].toString()).isEqualTo(REMETENTE);
        });
  }

  @Test
  void syncOnceFazUmaUnicaTentativaMesmoEmFalhaTransitoria() {
    ScriptedSender sender = new ScriptedSender(n -> new MailSendException("indisponivel"));

    MailOutcome outcome = service(sender).send(mail(MailKind.TEST), DeliveryMode.SYNC_ONCE);

    assertThat(sender.attempts).hasValue(1);
    assertThat(outcome).isEqualTo(MailOutcome.failed(MailFailureReason.TRANSIENT_EXHAUSTED, 1));
    assertThat(logs()).hasSize(1);
    assertThat(errors().get(0)).contains("1 tentativa(s)");
    assertThat(failures("retries_exhausted")).isEqualTo(1);
  }

  @Test
  void withRetryEsgotadoViraTransientExhaustedComTresTentativas() {
    ScriptedSender sender = new ScriptedSender(n -> new MailSendException("indisponivel"));

    MailOutcome outcome = service(sender).send(mail(MailKind.TEST), DeliveryMode.WITH_RETRY);

    assertThat(outcome).isEqualTo(MailOutcome.failed(MailFailureReason.TRANSIENT_EXHAUSTED, 3));
  }

  @Test
  void mapeiaCadaFalhaParaOMotivoDoHistorico() {
    assertThat(
            service(new ScriptedSender(n -> new MailAuthenticationException("recusada")))
                .send(mail(MailKind.TEST), DeliveryMode.WITH_RETRY))
        .isEqualTo(MailOutcome.failed(MailFailureReason.AUTHENTICATION, 1));
    assertThat(
            service(new ScriptedSender(n -> rejectedWith(550)))
                .send(mail(MailKind.TEST), DeliveryMode.WITH_RETRY))
        .isEqualTo(MailOutcome.failed(MailFailureReason.PERMANENT_REJECTION, 1));
    assertThat(
            service(new ScriptedSender(n -> new org.springframework.mail.MailParseException("x")))
                .send(mail(MailKind.TEST), DeliveryMode.WITH_RETRY))
        .isEqualTo(MailOutcome.failed(MailFailureReason.OTHER, 1));
    assertThat(failures("authentication")).isEqualTo(1);
    assertThat(failures("permanent_rejection")).isEqualTo(1);
    assertThat(failures("other")).isEqualTo(1);
  }

  @Test
  void timeoutDeLeituraViraTimeoutInclusiveEmSyncOnce() {
    MailSendException timeout =
        new MailSendException("falha", new java.net.SocketTimeoutException("Read timed out"));

    MailOutcome once =
        service(new ScriptedSender(n -> timeout)).send(mail(MailKind.TEST), DeliveryMode.SYNC_ONCE);
    MailOutcome retried =
        service(new ScriptedSender(n -> timeout))
            .send(mail(MailKind.TEST), DeliveryMode.WITH_RETRY);

    assertThat(once).isEqualTo(MailOutcome.failed(MailFailureReason.TIMEOUT, 1));
    assertThat(retried).isEqualTo(MailOutcome.failed(MailFailureReason.TIMEOUT, 3));
  }

  @Test
  void semRemetenteOuSemServidorConfiguradoNaoTentaEnviar() {
    ScriptedSender noFrom = new ScriptedSender(n -> null);
    JavaMailSenderImpl blankHost =
        new JavaMailSenderImpl() {
          @Override
          public void send(SimpleMailMessage message) {
            throw new AssertionError("não deveria enviar");
          }
        };
    blankHost.setHost("  ");

    MailOutcome withoutFrom =
        service(noFrom, "  ").send(mail(MailKind.TEST), DeliveryMode.SYNC_ONCE);
    MailOutcome withoutHost = service(blankHost).send(mail(MailKind.TEST), DeliveryMode.SYNC_ONCE);

    assertThat(withoutFrom).isEqualTo(MailOutcome.failed(MailFailureReason.NOT_CONFIGURED, 0));
    assertThat(withoutHost).isEqualTo(MailOutcome.failed(MailFailureReason.NOT_CONFIGURED, 0));
    assertThat(noFrom.attempts).hasValue(0);
    assertThat(logs()).allSatisfy(l -> assertThat(l).doesNotContain(DESTINATARIO));
  }

  @Test
  void servidorNuloNaoContaComoNaoConfigurado() {
    ScriptedSender nullHost = new ScriptedSender(n -> null);

    MailOutcome outcome = service(nullHost).send(mail(MailKind.TEST), DeliveryMode.SYNC_ONCE);

    assertThat(outcome).isEqualTo(MailOutcome.sent(1));
  }

  @Test
  void excecaoInesperadaDoSenderTambemNaoEPropagada() {
    ScriptedSender sender =
        new ScriptedSender(n -> null) {
          @Override
          public void send(SimpleMailMessage message) {
            throw new IllegalStateException("inesperado " + DESTINATARIO);
          }
        };

    MailOutcome outcome = service(sender).send(mail(MailKind.TEST), DeliveryMode.WITH_RETRY);

    assertThat(outcome).isEqualTo(MailOutcome.failed(MailFailureReason.OTHER, 1));
    assertThat(logs()).hasSize(1).allSatisfy(l -> assertThat(l).doesNotContain(DESTINATARIO));
  }

  @Test
  void ouvinteRecebeUmaUnicaChamadaComOResultadoFinal() {
    RecordingListener listener = new RecordingListener();
    ScriptedSender sender =
        new ScriptedSender(n -> n < 3 ? new MailSendException("conexao recusada") : null);

    service(sender, REMETENTE, listener)
        .send(mail(MailKind.PASSWORD_RESET), DeliveryMode.WITH_RETRY);

    assertThat(listener.mails).hasSize(1);
    assertThat(listener.mails.get(0).kind()).isEqualTo(MailKind.PASSWORD_RESET);
    assertThat(listener.mails.get(0).userId()).isEqualTo(7L);
    assertThat(listener.outcomes).containsExactly(MailOutcome.sent(3));
  }

  @Test
  void ouvinteTambemRecebeAFalhaFinal() {
    RecordingListener listener = new RecordingListener();

    service(new ScriptedSender(n -> new MailAuthenticationException("x")), REMETENTE, listener)
        .send(mail(MailKind.TEST), DeliveryMode.SYNC_ONCE);

    assertThat(listener.outcomes)
        .containsExactly(MailOutcome.failed(MailFailureReason.AUTHENTICATION, 1));
  }

  @Test
  void falhaDoOuvinteNaoAlteraOResultadoNemVazaDados() {
    RecordingListener second = new RecordingListener();
    MailDeliveryListener broken =
        (mail, outcome) -> {
          throw new IllegalStateException("erro com " + DESTINATARIO + " e " + LINK);
        };

    MailOutcome outcome =
        service(new ScriptedSender(n -> null), REMETENTE, broken, second)
            .send(mail(MailKind.TEST), DeliveryMode.SYNC_ONCE);

    assertThat(outcome).isEqualTo(MailOutcome.sent(1));
    assertThat(second.outcomes).hasSize(1);
    assertThat(errors()).hasSize(1);
    assertThat(errors().get(0)).contains("IllegalStateException");
    assertThat(logs())
        .allSatisfy(l -> assertThat(l).doesNotContain(DESTINATARIO).doesNotContain(LINK));
    assertThat(appender.list.get(0).getThrowableProxy()).isNull();
  }

  @Test
  void sendPasswordResetContinuaUsandoORotuloEOModelo() throws Exception {
    withSender(
        new String[] {},
        sender -> {
          service(sender).sendPasswordReset(DESTINATARIO, LINK);

          assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
          MimeMessage message = GREEN_MAIL.getReceivedMessages()[0];
          assertThat(message.getSubject()).isEqualTo("GEFINC: redefinição de senha");
          assertThat(String.valueOf(message.getContent())).contains(LINK).doesNotContain("{{");
        });
  }

  @Test
  void representacaoTextualNaoExpoeDestinatarioNemConteudo() {
    OutgoingMail mail = mail(MailKind.INVITATION);

    assertThat(mail.toString())
        .doesNotContain(DESTINATARIO)
        .doesNotContain(LINK)
        .doesNotContain("Corpo")
        .doesNotContain("assunto");
    assertThat(MailOutcome.failed(MailFailureReason.TIMEOUT, 2).toString())
        .doesNotContain(DESTINATARIO);
  }

  @FunctionalInterface
  private interface SenderConsumer {
    void accept(JavaMailSenderImpl sender) throws Exception;
  }
}
