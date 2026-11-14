package com.jvtech.gefinc.common.mail;

import com.jvtech.gefinc.common.config.AppProperties;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.regex.Pattern;
import org.eclipse.angus.mail.smtp.SMTPAddressFailedException;
import org.eclipse.angus.mail.smtp.SMTPSendFailedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Envio de e-mails transacionais em português. Falhas transitórias de envio ({@link
 * MailSendException}: conexão, timeout, SMTP 4xx) são re-tentadas um número limitado de vezes;
 * falhas de autenticação e rejeições permanentes (SMTP 5xx) não. Ao fim, a falha é registrada sem
 * dados pessoais, contada e nunca propagada.
 */
@Service
public class MailService {

  private static final Logger log = LoggerFactory.getLogger(MailService.class);

  private static final Pattern EMAIL_ADDRESS = Pattern.compile("[^\\s<>\"',;:]+@[^\\s<>\"',;]+");
  private static final int MAX_CAUSE_LENGTH = 200;

  private final JavaMailSender sender;
  private final AppProperties properties;
  private final int maxAttempts;
  private final Duration retryBackoff;
  private final MailMetrics metrics;
  private final String passwordResetTemplate;

  public MailService(
      JavaMailSender sender,
      AppProperties properties,
      @Value("${app.mail.max-attempts:3}") int maxAttempts,
      @Value("${app.mail.retry-backoff:1s}") Duration retryBackoff,
      MailMetrics metrics) {
    this.sender = sender;
    this.properties = properties;
    this.maxAttempts = Math.max(1, maxAttempts);
    this.retryBackoff = retryBackoff;
    this.metrics = metrics;
    this.passwordResetTemplate = load("mail/password-reset.txt");
  }

  public void sendPasswordReset(String to, String link) {
    SimpleMailMessage message = new SimpleMailMessage();
    message.setFrom(properties.mailFrom());
    message.setTo(to);
    message.setSubject("GEFINC: redefinição de senha");
    message.setText(passwordResetTemplate.replace("{{link}}", link));
    for (int attempt = 1; ; attempt++) {
      try {
        sender.send(message);
        return;
      } catch (MailException e) {
        // A resposta da API não pode variar: apenas registramos a falha, sem o endereço.
        boolean transientFailure = e instanceof MailSendException && !isPermanentRejection(e);
        boolean retry = transientFailure && attempt < maxAttempts;
        if (!retry) {
          metrics.failed(failureReason(e, transientFailure));
          log.error(
              "Falha ao enviar e-mail de redefinição de senha após {} tentativa(s): {} (causa: {})",
              attempt,
              e.getClass().getSimpleName(),
              describeRootCause(e, to));
          return;
        }
        log.warn(
            "Falha transitória ao enviar e-mail de redefinição de senha (tentativa {}/{}): {}"
                + " (causa: {})",
            attempt,
            maxAttempts,
            e.getClass().getSimpleName(),
            describeRootCause(e, to));
        if (!pause(retryBackoff.multipliedBy(attempt))) {
          metrics.failed(MailMetrics.FailureReason.INTERRUPTED);
          log.error("Envio de e-mail de redefinição de senha interrompido durante a espera");
          return;
        }
      }
    }
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

  private static String load(String path) {
    try {
      return new String(
          new ClassPathResource(path).getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
