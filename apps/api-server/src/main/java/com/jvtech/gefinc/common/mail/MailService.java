package com.jvtech.gefinc.common.mail;

import com.jvtech.gefinc.common.config.AppProperties;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/** Envio de e-mails transacionais em português. Falhas são registradas sem dados pessoais. */
@Service
public class MailService {

  private static final Logger log = LoggerFactory.getLogger(MailService.class);

  private final JavaMailSender sender;
  private final AppProperties properties;
  private final String passwordResetTemplate;

  public MailService(JavaMailSender sender, AppProperties properties) {
    this.sender = sender;
    this.properties = properties;
    this.passwordResetTemplate = load("mail/password-reset.txt");
  }

  public void sendPasswordReset(String to, String link) {
    SimpleMailMessage message = new SimpleMailMessage();
    message.setFrom(properties.mailFrom());
    message.setTo(to);
    message.setSubject("GEFINC: redefinição de senha");
    message.setText(passwordResetTemplate.replace("{{link}}", link));
    try {
      sender.send(message);
    } catch (MailException e) {
      // A resposta da API não pode variar: apenas registramos a falha, sem o endereço.
      log.error("Falha ao enviar e-mail de redefinição de senha: {}", e.getClass().getSimpleName());
    }
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
