package com.jvtech.gefinc.admin.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Pedido pendente de troca de e-mail por código de 6 dígitos.
 *
 * <p>O código nunca é gravado em claro: guarda-se apenas o HMAC {@code code_hash} vinculado ao id
 * da pendência. Ao sair do estado {@code PENDING}, o endereço {@code new_email} e o {@code
 * code_hash} são zerados (restrição do banco e princípio do menor privilégio).
 */
@Entity
@Table(name = "pending_email_changes")
public class PendingEmailChange {

  public static final String PENDING = "PENDING";
  public static final String CONFIRMED = "CONFIRMED";
  public static final String CANCELED = "CANCELED";
  public static final String EXPIRED = "EXPIRED";
  public static final String INVALIDATED = "INVALIDATED";
  public static final int MAX_ATTEMPTS = 5;

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private long userId;

  @Column(name = "requested_by")
  private Long requestedBy;

  @Column(name = "new_email", length = 254)
  private String newEmail;

  @Column(name = "new_email_ref", nullable = false, length = 32)
  private String newEmailRef;

  @Column(name = "code_hash", length = 64)
  private String codeHash;

  @Column(nullable = false)
  private short attempts;

  @Column(nullable = false, length = 11)
  private String status;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "expires_at", nullable = false)
  private Instant expiresAt;

  @Column(name = "resolved_at")
  private Instant resolvedAt;

  protected PendingEmailChange() {}

  public PendingEmailChange(
      long userId,
      Long requestedBy,
      String newEmail,
      String newEmailRef,
      String codeHash,
      Instant createdAt,
      Instant expiresAt) {
    this.userId = userId;
    this.requestedBy = requestedBy;
    this.newEmail = newEmail;
    this.newEmailRef = newEmailRef;
    this.codeHash = codeHash;
    this.attempts = 0;
    this.status = PENDING;
    this.createdAt = createdAt;
    this.expiresAt = expiresAt;
  }

  public Long getId() {
    return id;
  }

  public long getUserId() {
    return userId;
  }

  public Long getRequestedBy() {
    return requestedBy;
  }

  public String getNewEmail() {
    return newEmail;
  }

  public String getNewEmailRef() {
    return newEmailRef;
  }

  public String getCodeHash() {
    return codeHash;
  }

  public void assignCodeHash(String codeHash) {
    this.codeHash = codeHash;
  }

  public int getAttempts() {
    return attempts;
  }

  public int getAttemptsLeft() {
    return Math.max(0, MAX_ATTEMPTS - attempts);
  }

  public String getStatus() {
    return status;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public Instant getResolvedAt() {
    return resolvedAt;
  }

  public boolean isPending() {
    return PENDING.equals(status);
  }

  public boolean isExpired(Instant now) {
    return now.isAfter(expiresAt);
  }

  public void confirm(Instant now) {
    this.status = CONFIRMED;
    this.newEmail = null;
    this.codeHash = null;
    this.resolvedAt = now;
  }

  public void cancel(Instant now) {
    this.status = CANCELED;
    this.newEmail = null;
    this.codeHash = null;
    this.resolvedAt = now;
  }

  public void expire(Instant now) {
    this.status = EXPIRED;
    this.newEmail = null;
    this.codeHash = null;
    this.resolvedAt = now;
  }

  public void recordFailure(Instant now) {
    this.attempts++;
    if (this.attempts >= MAX_ATTEMPTS) {
      this.status = INVALIDATED;
      this.newEmail = null;
      this.codeHash = null;
      this.resolvedAt = now;
    }
  }
}
