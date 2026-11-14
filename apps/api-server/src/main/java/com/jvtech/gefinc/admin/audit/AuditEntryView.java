package com.jvtech.gefinc.admin.audit;

import java.time.Instant;
import java.util.Map;

/**
 * Linha da trilha como o painel a devolve ({@code AuditEntry} do contrato; o nome {@code
 * AuditEntry} em Java é o registro de escrita). {@code reason} é a justificativa livre do
 * administrador; {@code details} só tem as chaves do enum {@link AuditKey}; nunca há IP.
 */
public record AuditEntryView(
    long id,
    Instant occurredAt,
    AuditAction action,
    AuditResult result,
    PartyView actor,
    PartyView target,
    String subject,
    String reason,
    String refusalCode,
    String summary,
    Map<String, Object> details) {

  /** Sem justificativa, rótulos nem detalhes em logs. */
  @Override
  public String toString() {
    return "AuditEntryView[id=" + id + ", action=" + action + ", result=" + result + "]";
  }
}
