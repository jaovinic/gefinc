package com.jvtech.gefinc.admin.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Linha da trilha de auditoria. Imutável também no mapeamento (sem setters nem atualização); o
 * banco recusa UPDATE, DELETE e TRUNCATE. Nunca guarda e-mail, nome, IP, senha, token, link, código
 * ou valor financeiro.
 */
@Entity
@Immutable
@Table(name = "audit_log")
public class AuditLog {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "occurred_at", nullable = false, updatable = false)
  private Instant occurredAt;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 32, updatable = false)
  private AuditAction action;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 7, updatable = false)
  private AuditResult result;

  @Enumerated(EnumType.STRING)
  @Column(name = "actor_kind", nullable = false, length = 7, updatable = false)
  private ActorKind actorKind;

  @Column(name = "actor_user_id", updatable = false)
  private Long actorUserId;

  @Column(name = "target_user_id", updatable = false)
  private Long targetUserId;

  @Column(length = 60, updatable = false)
  private String subject;

  @Column(name = "reason_text", length = 1000, updatable = false)
  private String reasonText;

  @Column(name = "refusal_code", length = 32, updatable = false)
  private String refusalCode;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, updatable = false, columnDefinition = "jsonb")
  private Map<String, Object> details;

  @Column(name = "client_ref", length = 32, updatable = false)
  private String clientRef;

  @Column(name = "dedupe_key", length = 32, updatable = false)
  private String dedupeKey;

  @Column(name = "request_id", length = 40, updatable = false)
  private String requestId;

  protected AuditLog() {}

  AuditLog(
      Instant occurredAt, AuditEntry entry, String clientRef, String dedupeKey, String requestId) {
    this.occurredAt = occurredAt;
    this.action = entry.action();
    this.result = entry.result();
    this.actorKind = entry.actorKind();
    this.actorUserId = entry.actorUserId();
    this.targetUserId = entry.targetUserId();
    this.subject = entry.subject();
    this.reasonText = entry.reasonText();
    this.refusalCode = entry.refusalCode();
    this.details = entry.details().toMap();
    this.clientRef = clientRef;
    this.dedupeKey = dedupeKey;
    this.requestId = requestId;
  }

  public Long getId() {
    return id;
  }

  public Instant getOccurredAt() {
    return occurredAt;
  }

  public AuditAction getAction() {
    return action;
  }

  public AuditResult getResult() {
    return result;
  }

  public ActorKind getActorKind() {
    return actorKind;
  }

  public Long getActorUserId() {
    return actorUserId;
  }

  public Long getTargetUserId() {
    return targetUserId;
  }

  public String getSubject() {
    return subject;
  }

  public String getReasonText() {
    return reasonText;
  }

  public String getRefusalCode() {
    return refusalCode;
  }

  public Map<String, Object> getDetails() {
    return details;
  }

  public String getClientRef() {
    return clientRef;
  }

  public String getDedupeKey() {
    return dedupeKey;
  }

  public String getRequestId() {
    return requestId;
  }

  @Override
  public String toString() {
    return "AuditLog[id=" + id + ", action=" + action + ", result=" + result + "]";
  }
}
