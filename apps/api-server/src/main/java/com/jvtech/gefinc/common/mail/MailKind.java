package com.jvtech.gefinc.common.mail;

/** Tipo do e-mail, gravado no histórico de envios (sem o conteúdo). */
public enum MailKind {
  PASSWORD_RESET,
  TEST,
  INVITATION,
  DELETION_NOTICE,
  CANCELLATION_NOTICE,
  EMAIL_CHANGE_CODE,
  EMAIL_CHANGE_NOTICE
}
