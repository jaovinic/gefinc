package com.jvtech.gefinc.admin.invitation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.DynamicUpdate;

/**
 * Convite de cadastro. O e-mail fica em claro somente enquanto {@code PENDING}; o token só existe
 * no e-mail entregue e o banco guarda apenas o SHA-256 ({@code token_hash}).
 */
@Entity
@DynamicUpdate
@Table(name = "invitations")
public class Invitation {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(length = 254)
  private String email;

  @Column(name = "email_ref", nullable = false, length = 32)
  private String emailRef;

  @Column(name = "token_hash", nullable = false, unique = true, length = 64)
  private String tokenHash;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 8)
  private InvitationStatus status = InvitationStatus.PENDING;

  @Column(name = "expires_at", nullable = false)
  private Instant expiresAt;

  @Column(name = "invited_by")
  private Long invitedBy;

  @Column(name = "accepted_user_id")
  private Long acceptedUserId;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "resolved_at")
  private Instant resolvedAt;

  protected Invitation() {}

  public Invitation(
      String email,
      String emailRef,
      String tokenHash,
      Instant expiresAt,
      Long invitedBy,
      Instant createdAt) {
    this.email = email;
    this.emailRef = emailRef;
    this.tokenHash = tokenHash;
    this.status = InvitationStatus.PENDING;
    this.expiresAt = expiresAt;
    this.invitedBy = invitedBy;
    this.createdAt = createdAt;
  }

  public Long getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public String getEmailRef() {
    return emailRef;
  }

  public String getTokenHash() {
    return tokenHash;
  }

  public InvitationStatus getStatus() {
    return status;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public Long getInvitedBy() {
    return invitedBy;
  }

  public Long getAcceptedUserId() {
    return acceptedUserId;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getResolvedAt() {
    return resolvedAt;
  }

  public boolean isPending() {
    return status == InvitationStatus.PENDING;
  }

  public boolean isExpired(Instant now) {
    return !expiresAt.isAfter(now);
  }

  /**
   * Reenvia o convite: novo hash de token e prorrogação da validade por mais 7 dias. O e-mail
   * continua em claro enquanto pendente.
   */
  public void resend(String newTokenHash, Instant newExpiresAt) {
    this.tokenHash = newTokenHash;
    this.expiresAt = newExpiresAt;
  }

  /**
   * Cancela o convite pendente: transiciona para CANCELED, zera o e-mail em claro (ck_inv_email) e
   * marca a resolução.
   */
  public void cancel(Instant now) {
    this.status = InvitationStatus.CANCELED;
    this.email = null;
    this.resolvedAt = now;
  }

  /** Expira o convite: transiciona para EXPIRED, zera o e-mail em claro e marca a resolução. */
  public void expire(Instant now) {
    this.status = InvitationStatus.EXPIRED;
    this.email = null;
    this.resolvedAt = now;
  }

  /** Aceita o convite: vincula ao usuário criado, zera o e-mail em claro e marca a resolução. */
  public void accept(long userId, Instant now) {
    this.status = InvitationStatus.ACCEPTED;
    this.acceptedUserId = userId;
    this.email = null;
    this.resolvedAt = now;
  }
}
