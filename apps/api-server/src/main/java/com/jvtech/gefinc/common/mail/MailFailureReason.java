package com.jvtech.gefinc.common.mail;

/** Motivo (sem dados pessoais) da falha final de um envio; vai para o histórico de envios. */
public enum MailFailureReason {
  AUTHENTICATION,
  PERMANENT_REJECTION,
  TRANSIENT_EXHAUSTED,
  TIMEOUT,
  NOT_CONFIGURED,
  OTHER
}
