package com.jvtech.gefinc.admin.email;

import com.jvtech.gefinc.common.mail.MailFailureReason;
import com.jvtech.gefinc.common.mail.MailKind;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Registro de um envio de e-mail (histórico de 90 dias). Guarda só metadados: nunca corpo, assunto,
 * link, token, código nem a mensagem técnica do servidor de e-mail.
 */
@Entity
@Table(name = "email_deliveries")
public class EmailDelivery {

  public static final String SENT = "SENT";
  public static final String FAILED = "FAILED";

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 24)
  private MailKind kind;

  @Column(name = "recipient_email", length = 254)
  private String recipientEmail;

  @Column(name = "recipient_ref", nullable = false, length = 32)
  private String recipientRef;

  @Column(name = "user_id")
  private Long userId;

  @Column(nullable = false, length = 6)
  private String status;

  @Enumerated(EnumType.STRING)
  @Column(name = "failure_reason", length = 20)
  private MailFailureReason failureReason;

  @Column(nullable = false)
  private short attempts;

  protected EmailDelivery() {}

  public EmailDelivery(
      Instant createdAt,
      MailKind kind,
      String recipientEmail,
      String recipientRef,
      Long userId,
      boolean sent,
      MailFailureReason failureReason,
      int attempts) {
    this.createdAt = createdAt;
    this.kind = kind;
    this.recipientEmail = recipientEmail;
    this.recipientRef = recipientRef;
    this.userId = userId;
    this.status = sent ? SENT : FAILED;
    this.failureReason = sent ? null : failureReason;
    this.attempts = (short) Math.min(attempts, Short.MAX_VALUE);
  }

  public Long getId() {
    return id;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public MailKind getKind() {
    return kind;
  }

  public String getRecipientEmail() {
    return recipientEmail;
  }

  public String getRecipientRef() {
    return recipientRef;
  }

  public Long getUserId() {
    return userId;
  }

  public String getStatus() {
    return status;
  }

  public MailFailureReason getFailureReason() {
    return failureReason;
  }

  public short getAttempts() {
    return attempts;
  }

  @Override
  public String toString() {
    return "EmailDelivery[id=" + id + ", kind=" + kind + ", status=" + status + "]";
  }
}
