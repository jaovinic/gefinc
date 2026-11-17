package com.jvtech.gefinc.admin.deletion;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Avisos de exclusão ou cancelamento que não puderam ser entregues por e-mail (US10, V19).
 * retained_email é a única retenção do endereço de conta removida (30 dias, nunca exposto na API).
 * Todo estado final (DELIVERED, DISCARDED, EXPIRED) zera retained_email (restrição do banco).
 */
@Entity
@Table(name = "pending_communications")
public class PendingCommunication {

  public static final String KIND_DELETION_NOTICE = "DELETION_NOTICE";
  public static final String KIND_CANCELLATION_NOTICE = "CANCELLATION_NOTICE";

  public static final String STATE_PENDING = "PENDING";
  public static final String STATE_DELIVERED = "DELIVERED";
  public static final String STATE_DISCARDED = "DISCARDED";
  public static final String STATE_EXPIRED = "EXPIRED";

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 19)
  private String kind;

  @Column(name = "deletion_request_id", nullable = false)
  private long deletionRequestId;

  @Column(name = "user_id", nullable = false)
  private long userId;

  @Column(name = "target_ref", nullable = false, length = 32)
  private String targetRef;

  @Column(nullable = false, length = 9)
  private String state;

  @Column(name = "failure_reason", length = 20)
  private String failureReason;

  @Column(nullable = false)
  private short attempts;

  @Column(name = "retained_email", length = 254)
  private String retainedEmail;

  @Column(name = "retained_until")
  private Instant retainedUntil;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "resolved_at")
  private Instant resolvedAt;

  protected PendingCommunication() {}

  public PendingCommunication(
      String kind,
      long deletionRequestId,
      long userId,
      String targetRef,
      String failureReason,
      int attempts,
      Instant createdAt) {
    this.kind = kind;
    this.deletionRequestId = deletionRequestId;
    this.userId = userId;
    this.targetRef = targetRef;
    this.state = STATE_PENDING;
    this.failureReason = failureReason;
    this.attempts = (short) Math.max(1, attempts);
    this.createdAt = createdAt;
  }

  public Long getId() {
    return id;
  }

  public String getKind() {
    return kind;
  }

  public long getDeletionRequestId() {
    return deletionRequestId;
  }

  public long getUserId() {
    return userId;
  }

  public String getTargetRef() {
    return targetRef;
  }

  public String getState() {
    return state;
  }

  public String getFailureReason() {
    return failureReason;
  }

  public int getAttempts() {
    return attempts;
  }

  public String getRetainedEmail() {
    return retainedEmail;
  }

  public Instant getRetainedUntil() {
    return retainedUntil;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getResolvedAt() {
    return resolvedAt;
  }

  public boolean isPending() {
    return STATE_PENDING.equals(state);
  }

  /** Retém o endereço de e-mail ao apagar definitivamente a conta de usuário (FR-057). */
  public void retainEmail(String email, Instant until) {
    if (isPending()) {
      this.retainedEmail = email;
      this.retainedUntil = until;
    }
  }

  /** Reenvio bem-sucedido: passa a DELIVERED e apaga o e-mail retido. */
  public void markDelivered(Instant now) {
    this.state = STATE_DELIVERED;
    this.retainedEmail = null;
    this.resolvedAt = now;
  }

  /** Descarte manual pelo administrador: apaga o endereço e remove do alerta. */
  public void discard(Instant now) {
    this.state = STATE_DISCARDED;
    this.retainedEmail = null;
    this.resolvedAt = now;
  }

  /** Expiração de 30 dias após a remoção da conta: apaga o endereço retido. */
  public void expire(Instant now) {
    this.state = STATE_EXPIRED;
    this.retainedEmail = null;
    this.resolvedAt = now;
  }

  /** Incrementa tentativas e atualiza motivo da falha. */
  public void recordFailedAttempt(String failureReason) {
    this.attempts++;
    this.failureReason = failureReason;
  }
}
