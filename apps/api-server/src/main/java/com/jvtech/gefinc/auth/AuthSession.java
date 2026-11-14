package com.jvtech.gefinc.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Sessão de autenticação: uma por família de tokens de renovação (o {@code id} é o {@code
 * family_id}) e a que a claim {@code sid} do token de acesso aponta. IP e rótulo do dispositivo são
 * dado pessoal e só saem pelo painel administrativo; as escritas são feitas por {@link
 * AuthSessionRepository} (inserção e atualizações em massa), nunca pela entidade.
 */
@Entity
@Table(name = "auth_sessions")
public class AuthSession {

  @Id private UUID id;

  @Column(name = "user_id", nullable = false)
  private long userId;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "last_used_at", nullable = false)
  private Instant lastUsedAt;

  @Column(name = "expires_at", nullable = false)
  private Instant expiresAt;

  @Column(name = "client_ip")
  private String clientIp;

  @Column(name = "device_label")
  private String deviceLabel;

  @Column(name = "client_kind", nullable = false)
  private String clientKind;

  @Column(name = "revoked_at")
  private Instant revokedAt;

  @Column(name = "revoked_by")
  private String revokedBy;

  protected AuthSession() {}

  public UUID getId() {
    return id;
  }

  public long getUserId() {
    return userId;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getLastUsedAt() {
    return lastUsedAt;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public String getClientIp() {
    return clientIp;
  }

  public String getDeviceLabel() {
    return deviceLabel;
  }

  public String getClientKind() {
    return clientKind;
  }

  public Instant getRevokedAt() {
    return revokedAt;
  }

  public String getRevokedBy() {
    return revokedBy;
  }

  /** Sem IP nem dispositivo em logs. */
  @Override
  public String toString() {
    return "AuthSession[id=" + id + "]";
  }
}
