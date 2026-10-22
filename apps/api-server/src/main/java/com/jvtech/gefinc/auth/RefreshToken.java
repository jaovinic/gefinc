package com.jvtech.gefinc.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Token de renovação de sessão; guarda só o hash e pertence a uma família (um login). */
@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private long userId;

  @Column(name = "family_id", nullable = false)
  private UUID familyId;

  @Column(name = "token_hash", nullable = false)
  private String tokenHash;

  @Column(name = "expires_at", nullable = false)
  private Instant expiresAt;

  @Column(name = "revoked_at")
  private Instant revokedAt;

  @Column(name = "replaced_by_id")
  private Long replacedById;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  protected RefreshToken() {}

  public RefreshToken(
      long userId, UUID familyId, String tokenHash, Instant expiresAt, Instant now) {
    this.userId = userId;
    this.familyId = familyId;
    this.tokenHash = tokenHash;
    this.expiresAt = expiresAt;
    this.createdAt = now;
  }

  public Long getId() {
    return id;
  }

  public long getUserId() {
    return userId;
  }

  public UUID getFamilyId() {
    return familyId;
  }

  public boolean isRevoked() {
    return revokedAt != null;
  }

  public boolean isExpired(Instant now) {
    return !expiresAt.isAfter(now);
  }

  public void revoke(Instant now, Long replacedById) {
    this.revokedAt = now;
    this.replacedById = replacedById;
  }
}
