package com.jvtech.gefinc.common.mail;

import com.jvtech.gefinc.common.config.AppProperties;
import java.net.SocketTimeoutException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.eclipse.angus.mail.smtp.SMTPAddressFailedException;
import org.eclipse.angus.mail.smtp.SMTPSendFailedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Service;

/**
 * Envio de e-mails transacionais em português. No modo {@link DeliveryMode#WITH_RETRY}, falhas
 * transitórias de envio ({@link MailSendException}: conexão, timeout, SMTP 4xx) são re-tentadas um
 * número limitado de vezes; no modo {@link DeliveryMode#SYNC_ONCE} há uma única tentativa. Falhas
 * de autenticação e rejeições permanentes (SMTP 5xx) nunca são re-tentadas. Ao fim, a falha é
 * registrada sem dados pessoais, contada e devolvida como {@link MailOutcome}: o envio nunca lança
 * por falha de e-mail. Os {@link MailDeliveryListener} recebem o resultado final uma única vez.
 */
@Service
public class MailService {

  private static final Logger log = LoggerFactory.getLogger(MailService.class);

  private static final Pattern EMAIL_ADDRESS = Pattern.compile("[^\\s<>\"',;:]+@[^\\s<>\"',;]+");
  private static final int MAX_CAUSE_LENGTH = 200;
  private static final String PASSWORD_RESET_SUBJECT = "GEFINC: redefinição de senha";

  private final JavaMailSender sender;
  private final AppProperties properties;
  private final int maxAttempts;
  private final Duration retryBackoff;
  private final MailMetrics metrics;
  private final List<MailDeliveryListener> listeners;

  public MailService(
      JavaMailSender sender,
      AppProperties properties,
      @Value("${app.mail.max-attempts:3}") int maxAttempts,
      @Value("${app.mail.retry-backoff:1s}") Duration retryBackoff,
      MailMetrics metrics,
      List<MailDeliveryListener> listeners) {
    this.sender = sender;
    this.properties = properties;
    this.maxAttempts = Math.max(1, maxAttempts);
    this.retryBackoff = retryBackoff;
    this.metrics = metrics;
    this.listeners = List.copyOf(listeners);
  }

  /** Atalho do e-mail de redefinição de senha, sem usuário associado, com re-tentativas. */
  public void sendPasswordReset(String to, String link) {
    sendPasswordReset(to, link, null);
  }

  public MailOutcome sendPasswordReset(String to, String link, Long userId) {
    return send(
        new OutgoingMail(
            MailKind.PASSWORD_RESET,
            to,
            PASSWORD_RESET_SUBJECT,
            MailTemplates.render("password-reset", Map.of("link", link)),
            userId),
        DeliveryMode.WITH_RETRY);
  }

  /** Envia e devolve o resultado final; nunca lança por falha de e-mail. */
  public MailOutcome send(OutgoingMail mail, DeliveryMode mode) {
    MailOutcome outcome = deliver(mail, mode);
    notifyListeners(mail, outcome);
    return outcome;
  }

  private MailOutcome deliver(OutgoingMail mail, DeliveryMode mode) {
    if (notConfigured()) {
      metrics.failed(MailMetrics.FailureReason.OTHER);
      log.error("E-mail não enviado: o envio de e-mail não está configurado.");
      return MailOutcome.failed(MailFailureReason.NOT_CONFIGURED, 0);
    }
    SimpleMailMessage message = new SimpleMailMessage();
    message.setFrom(properties.mailFrom());
    message.setTo(mail.to());
    message.setSubject(mail.subject());
    message.setText(mail.body());
    String label = describe(mail.kind());
    for (int attempt = 1; ; attempt++) {
      try {
        sender.send(message);
        return MailOutcome.sent(attempt);
      } catch (MailException e) {
        // A resposta da API não pode variar: apenas registramos a falha, sem o endereço.
        boolean transientFailure = e instanceof MailSendException && !isPermanentRejection(e);
        boolean retry =
            mode == DeliveryMode.WITH_RETRY && transientFailure && attempt < maxAttempts;
        if (!retry) {
          metrics.failed(failureReason(e, transientFailure));
          log.error(
              "Falha ao enviar e-mail {} após {} tentativa(s): {} (causa: {})",
              label,
              attempt,
              e.getClass().getSimpleName(),
              describeRootCause(e, mail.to()));
          return MailOutcome.failed(historyReason(e, transientFailure), attempt);
        }
        log.warn(
            "Falha transitória ao enviar e-mail {} (tentativa {}/{}): {} (causa: {})",
            label,
            attempt,
            maxAttempts,
            e.getClass().getSimpleName(),
            describeRootCause(e, mail.to()));
        if (!pause(retryBackoff.multipliedBy(attempt))) {
          metrics.failed(MailMetrics.FailureReason.INTERRUPTED);
          log.error("Envio de e-mail {} interrompido durante a espera", label);
          return MailOutcome.failed(MailFailureReason.OTHER, attempt);
        }
      } catch (RuntimeException e) {
        // Nunca propaga nem registra a mensagem: ela poderia conter o destinatário.
        metrics.failed(MailMetrics.FailureReason.OTHER);
        log.error(
            "Falha inesperada ao enviar e-mail {} após {} tentativa(s): {}",
            label,
            attempt,
            e.getClass().getSimpleName());
        return MailOutcome.failed(MailFailureReason.OTHER, attempt);
      }
    }
  }

  private void notifyListeners(OutgoingMail mail, MailOutcome outcome) {
    for (MailDeliveryListener listener : listeners) {
      try {
        listener.onDelivery(mail, outcome);
      } catch (RuntimeException e) {
        // Só a classe: a mensagem poderia conter destinatário, link ou código.
        log.error(
            "Falha ao notificar o resultado do envio de e-mail: {}", e.getClass().getSimpleName());
      }
    }
  }

  /** Há remetente e servidor configurados. */
  public boolean isConfigured() {
    return !notConfigured();
  }

  /**
   * Sem remetente, ou com um {@link JavaMailSenderImpl} cujo servidor foi informado em branco.
   * Servidor nulo não conta: o sender pode ser um dublê ou ter o servidor definido por outros
   * meios.
   */
  private boolean notConfigured() {
    String from = properties.mailFrom();
    if (from == null || from.isBlank()) {
      return true;
    }
    return sender instanceof JavaMailSenderImpl impl
        && impl.getHost() != null
        && impl.getHost().isBlank();
  }

  private static String describe(MailKind kind) {
    return kind == MailKind.PASSWORD_RESET
        ? "de redefinição de senha"
        : "(" + kind.name().toLowerCase(java.util.Locale.ROOT) + ")";
  }

  /** Motivo gravado no histórico de envios (mais fino que o rótulo da métrica). */
  private static MailFailureReason historyReason(MailException e, boolean transientFailure) {
    if (e instanceof MailAuthenticationException) {
      return MailFailureReason.AUTHENTICATION;
    }
    if (isPermanentRejection(e)) {
      return MailFailureReason.PERMANENT_REJECTION;
    }
    if (hasTimeout(e)) {
      return MailFailureReason.TIMEOUT;
    }
    return transientFailure ? MailFailureReason.TRANSIENT_EXHAUSTED : MailFailureReason.OTHER;
  }

  private static boolean hasTimeout(Throwable error) {
    Throwable current = error;
    for (int depth = 0; current != null && depth < 10; depth++) {
      if (current instanceof SocketTimeoutException) {
        return true;
      }
      if (current instanceof MailSendException sendError) {
        for (Exception failure : sendError.getMessageExceptions()) {
          if (failure != null && hasTimeout(failure)) {
            return true;
          }
        }
      }
      current = current.getCause() == current ? null : current.getCause();
    }
    return false;
  }

  private static MailMetrics.FailureReason failureReason(
      MailException e, boolean transientFailure) {
    if (e instanceof MailAuthenticationException) {
      return MailMetrics.FailureReason.AUTHENTICATION;
    }
    if (transientFailure) {
      return MailMetrics.FailureReason.RETRIES_EXHAUSTED;
    }
    return isPermanentRejection(e)
        ? MailMetrics.FailureReason.PERMANENT_REJECTION
        : MailMetrics.FailureReason.OTHER;
  }

  /**
   * Rejeição permanente (SMTP 5xx) do destinatário ou do servidor: repetir não adianta. Falhas de
   * conexão, timeout e respostas 4xx continuam sendo tratadas como transitórias.
   */
  private static boolean isPermanentRejection(MailException error) {
    if (error instanceof MailSendException sendError) {
      for (Exception failure : sendError.getMessageExceptions()) {
        if (hasPermanentSmtpCode(failure)) {
          return true;
        }
      }
    }
    return hasPermanentSmtpCode(error);
  }

  private static boolean hasPermanentSmtpCode(Throwable error) {
    Throwable current = error;
    for (int depth = 0; current != null && depth < 10; depth++) {
      int code = smtpReturnCode(current);
      if (code >= 500 && code < 600) {
        return true;
      }
      current = current.getCause() == current ? null : current.getCause();
    }
    return false;
  }

  private static int smtpReturnCode(Throwable error) {
    if (error instanceof SMTPAddressFailedException address) {
      return address.getReturnCode();
    }
    if (error instanceof SMTPSendFailedException send) {
      return send.getReturnCode();
    }
    return 0;
  }

  private static boolean pause(Duration duration) {
    try {
      Thread.sleep(duration);
      return true;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return false;
    }
  }

  /** Classe e mensagem da causa raiz, sem endereços de e-mail e limitada em tamanho. */
  private static String describeRootCause(Throwable error, String recipient) {
    Throwable root = error;
    for (int depth = 0; root.getCause() != null && root.getCause() != root && depth < 10; depth++) {
      root = root.getCause();
    }
    String message = root.getMessage() == null ? "" : root.getMessage();
    message = message.replace(recipient, "[email]");
    message = EMAIL_ADDRESS.matcher(message).replaceAll("[email]");
    message = message.replaceAll("\\s+", " ").strip();
    if (message.length() > MAX_CAUSE_LENGTH) {
      message = message.substring(0, MAX_CAUSE_LENGTH) + "...";
    }
    String type = root.getClass().getSimpleName();
    return message.isEmpty() ? type : type + ": " + message;
  }
}
