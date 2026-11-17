package com.jvtech.gefinc.admin.deletion;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Entidade JPA mapeando avisos de entrega única ao usuário (V15). Hoje usado para avisos de
 * exclusão cancelada pelo administrador (kind = 'DELETION_CANCELED').
 */
@Entity
@Table(name = "user_notices")
public class UserNotice {

  public static final String KIND_DELETION_CANCELED = "DELETION_CANCELED";

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private long userId;

  @Column(nullable = false, length = 20)
  private String kind;

  @Column(name = "deletion_request_id", nullable = false)
  private long deletionRequestId;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "delivered_at")
  private Instant deliveredAt;

  @Column(name = "dismissed_at")
  private Instant dismissedAt;

  protected UserNotice() {}

  public UserNotice(long userId, String kind, long deletionRequestId, Instant createdAt) {
    this.userId = userId;
    this.kind = kind;
    this.deletionRequestId = deletionRequestId;
    this.createdAt = createdAt;
  }

  public Long getId() {
    return id;
  }

  public long getUserId() {
    return userId;
  }

  public String getKind() {
    return kind;
  }

  public long getDeletionRequestId() {
    return deletionRequestId;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getDeliveredAt() {
    return deliveredAt;
  }

  public Instant getDismissedAt() {
    return dismissedAt;
  }

  public void markDelivered(Instant deliveredAt) {
    this.deliveredAt = deliveredAt;
  }

  public void dismiss(Instant dismissedAt) {
    this.dismissedAt = dismissedAt;
  }
}
