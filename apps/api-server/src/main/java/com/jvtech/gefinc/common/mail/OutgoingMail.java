package com.jvtech.gefinc.common.mail;

/**
 * E-mail a enviar. {@code userId} é o usuário relacionado, quando houver. Destinatário, assunto e
 * corpo (que pode conter link ou código) nunca aparecem em {@code toString}.
 */
public record OutgoingMail(MailKind kind, String to, String subject, String body, Long userId) {

  @Override
  public String toString() {
    return "OutgoingMail[kind=" + kind + ", to=[email], subject=[redacted], body=[redacted]]";
  }
}
