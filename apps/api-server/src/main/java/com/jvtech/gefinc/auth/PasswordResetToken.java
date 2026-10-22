package com.jvtech.gefinc.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** Link de redefinição de senha: de uso único, com validade curta; guarda só o hash. */
@Entity
@Table(name = "password_reset_tokens")
public class PasswordResetToken {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private long userId;

  @Column(name = "token_hash", nullable = false)
  private String tokenHash;

  @Column(name = "expires_at", nullable = false)
  private Instant expiresAt;

  @Column(name = "used_at")
  private Instant usedAt;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  protected PasswordResetToken() {}

  public PasswordResetToken(long userId, String tokenHash, Instant expiresAt, Instant now) {
    this.userId = userId;
    this.tokenHash = tokenHash;
    this.expiresAt = expiresAt;
    this.createdAt = now;
  }

  public long getUserId() {
    return userId;
  }

  public boolean isUsable(Instant now) {
    return usedAt == null && expiresAt.isAfter(now);
  }

  public void markUsed(Instant now) {
    this.usedAt = now;
  }
}
