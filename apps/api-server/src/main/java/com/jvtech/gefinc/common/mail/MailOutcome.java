package com.jvtech.gefinc.common.mail;

/** Resultado final de um envio: nunca carrega destinatário nem mensagem técnica do servidor. */
public record MailOutcome(boolean sent, MailFailureReason reason, int attempts) {

  public static MailOutcome sent(int attempts) {
    return new MailOutcome(true, null, attempts);
  }

  public static MailOutcome failed(MailFailureReason reason, int attempts) {
    return new MailOutcome(false, reason, attempts);
  }
}
