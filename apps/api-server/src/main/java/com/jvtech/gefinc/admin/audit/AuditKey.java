package com.jvtech.gefinc.admin.audit;

/**
 * Únicas chaves aceitas em {@code audit_log.details}. Enum fechado de propósito: uma chave nova
 * exige mudança de código revisada, o que impede dado pessoal de entrar por descuido.
 */
public enum AuditKey {
  FIELD("field"),
  FROM("from"),
  TO("to"),
  EMAIL_REF("emailRef"),
  OLD_EMAIL_REF("oldEmailRef"),
  OLD_NAME_REF("oldNameRef"),
  DAYS("days"),
  MODE("mode"),
  REASON_ID("reasonId"),
  PARAMETER("parameter"),
  COUNT("count"),
  REQUEST_ID("requestId");

  private final String json;

  AuditKey(String json) {
    this.json = json;
  }

  /** Nome da chave no JSON gravado. */
  public String json() {
    return json;
  }
}
