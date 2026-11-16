package com.jvtech.gefinc.admin.audit;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Detalhes da ação: só chaves de {@link AuditKey} e valores escalares curtos. Recusa texto com
 * {@code @} (e-mail), {@code ://} (URL) ou mais de 64 caracteres. Nunca senha, token, link, código,
 * e-mail, nome, IP nem valor monetário.
 */
public final class AuditDetails {

  static final int MAX_VALUE_LENGTH = 64;

  private final Map<String, Object> values = new LinkedHashMap<>();

  private AuditDetails() {}

  public static AuditDetails of() {
    return new AuditDetails();
  }

  public AuditDetails put(AuditKey key, String value) {
    if (value == null) {
      throw new IllegalArgumentException("Valor nulo em detalhe de auditoria.");
    }
    if (AuditEntry.hasNul(value)
        || value.length() > MAX_VALUE_LENGTH
        || value.contains("@")
        || value.contains("://")) {
      throw new IllegalArgumentException("Valor não permitido em detalhe de auditoria.");
    }
    values.put(key.json(), value);
    return this;
  }

  public AuditDetails put(AuditKey key, long value) {
    values.put(key.json(), value);
    return this;
  }

  public AuditDetails put(AuditKey key, boolean value) {
    values.put(key.json(), value);
    return this;
  }

  /** Cópia imutável para gravação. */
  public Map<String, Object> toMap() {
    return Map.copyOf(values);
  }

  @Override
  public String toString() {
    return "AuditDetails" + values.keySet();
  }
}
