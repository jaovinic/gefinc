package com.jvtech.gefinc.admin.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Dado pessoal descartável de uma linha da trilha (IP real e rótulo do dispositivo). Apagado em
 * cascata com o usuário e por rotina de retenção para visitantes.
 */
@Entity
@Table(name = "audit_log_client")
public class AuditLogClient {

  @Id
  @Column(name = "audit_id")
  private Long auditId;

  @Column(name = "user_id")
  private Long userId;

  @Column(nullable = false, length = 45)
  private String ip;

  @Column(name = "device_label", length = 80)
  private String deviceLabel;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  protected AuditLogClient() {}

  AuditLogClient(long auditId, Long userId, String ip, String deviceLabel, Instant createdAt) {
    this.auditId = auditId;
    this.userId = userId;
    this.ip = ip;
    this.deviceLabel = deviceLabel;
    this.createdAt = createdAt;
  }

  public Long getAuditId() {
    return auditId;
  }

  public Long getUserId() {
    return userId;
  }

  public String getIp() {
    return ip;
  }

  public String getDeviceLabel() {
    return deviceLabel;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  @Override
  public String toString() {
    return "AuditLogClient[auditId=" + auditId + "]";
  }
}
