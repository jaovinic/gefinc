package com.jvtech.gefinc.user;

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
 * {@code @DynamicUpdate}: o UPDATE grava só as colunas alteradas, então um login ou renovação
 * concorrente não sobrescreve {@code role}, {@code suspended_at} ou {@code token_version} com
 * valores lidos antes (e o gatilho do raiz só vê {@code role} quando ele muda de fato).
 */
@Entity
@DynamicUpdate
@Table(name = "users")
public class User {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private String email;

  @Column(length = 80)
  private String name;

  @Column(name = "password_hash", nullable = false)
  private String passwordHash;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "deletion_requested_at")
  private Instant deletionRequestedAt;

  @Column(name = "deletion_due_at")
  private Instant deletionDueAt;

  @Column(name = "deletion_origin", length = 5)
  private String deletionOrigin;

  @Column(name = "deletion_request_id")
  private Long deletionRequestId;

  @Column(name = "token_version", nullable = false)
  private int tokenVersion;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 5)
  private UserRole role = UserRole.USER;

  @Column(name = "suspended_at")
  private Instant suspendedAt;

  @Column(name = "last_access_at")
  private Instant lastAccessAt;

  protected User() {}

  public User(String email, String passwordHash, Instant createdAt) {
    this.email = email;
    this.passwordHash = passwordHash;
    this.createdAt = createdAt;
  }

  public Long getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  /** Atualiza o e-mail da conta e invalida de imediato os tokens de acesso já emitidos. */
  public void changeEmail(String newEmail) {
    this.email = newEmail;
    this.tokenVersion++;
  }

  public String getName() {
    return name;
  }

  /** Nome de exibição; em branco volta a ficar sem nome. */
  public void rename(String newName) {
    this.name = newName == null || newName.isBlank() ? null : newName.strip();
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getDeletionRequestedAt() {
    return deletionRequestedAt;
  }

  public Instant getDeletionDueAt() {
    return deletionDueAt;
  }

  public String getDeletionOrigin() {
    return deletionOrigin;
  }

  public Long getDeletionRequestId() {
    return deletionRequestId;
  }

  public int getTokenVersion() {
    return tokenVersion;
  }

  public boolean isDeletionPending() {
    return deletionRequestedAt != null;
  }

  /** Exclusão pendente pedida por um administrador (o usuário não a cancela). */
  public boolean isDeletionByAdmin() {
    return isDeletionPending() && "ADMIN".equals(deletionOrigin);
  }

  public UserRole getRole() {
    return role;
  }

  public Instant getSuspendedAt() {
    return suspendedAt;
  }

  public Instant getLastAccessAt() {
    return lastAccessAt;
  }

  public boolean isSuspended() {
    return suspendedAt != null;
  }

  /** Conta utilizável: sem suspensão e sem exclusão pendente. */
  public boolean isActive() {
    return !isSuspended() && !isDeletionPending();
  }

  /**
   * Suspende a conta e invalida de imediato os tokens de acesso já emitidos. Suspender de novo não
   * muda a data da suspensão.
   */
  public void suspend(Instant now) {
    if (this.suspendedAt == null) {
      this.suspendedAt = now;
    }
    this.tokenVersion++;
  }

  /**
   * Reativa a conta suspensa e invalida os tokens anteriores (nenhuma sessão antiga ressuscita). A
   * exclusão pendente, se houver, continua. Reativar conta que não está suspensa não muda nada.
   */
  public void reactivate() {
    if (this.suspendedAt != null) {
      this.suspendedAt = null;
      this.tokenVersion++;
    }
  }

  /** Invalida de imediato todos os tokens de acesso já emitidos (inclusive os sem sessão). */
  public void revokeAccessTokens() {
    this.tokenVersion++;
  }

  /** Concede o perfil de administrador a um usuário comum; administrador e raiz não mudam. */
  public void grantAdmin() {
    if (role == UserRole.USER) {
      this.role = UserRole.ADMIN;
    }
  }

  /** Retira o perfil de administrador; o raiz nunca é rebaixado por aqui. */
  public void revokeAdmin() {
    if (role == UserRole.ADMIN) {
      this.role = UserRole.USER;
    }
  }

  /** Troca a senha e invalida de imediato os tokens de acesso já emitidos. */
  public void changePassword(String newHash) {
    this.passwordHash = newHash;
    this.tokenVersion++;
  }

  /**
   * Agenda a exclusão pedida pelo próprio usuário e invalida de imediato os tokens de acesso já
   * emitidos. As quatro colunas de exclusão andam juntas (restrição do banco).
   */
  public void scheduleDeletion(Instant now, Instant dueAt, long requestId) {
    this.deletionRequestedAt = now;
    this.deletionDueAt = dueAt;
    this.deletionOrigin = "USER";
    this.deletionRequestId = requestId;
    this.tokenVersion++;
  }

  /** Agenda ou antecipa a exclusão pedida por administrador. */
  public void scheduleAdminDeletion(Instant requestedAt, Instant dueAt, long requestId) {
    this.deletionRequestedAt = requestedAt;
    this.deletionDueAt = dueAt;
    this.deletionOrigin = "ADMIN";
    this.deletionRequestId = requestId;
    this.tokenVersion++;
  }

  /** Restaura o agendamento de exclusão anterior (por exemplo, na reversão de uma antecipação). */
  public void restoreScheduledDeletion(
      Instant requestedAt, Instant dueAt, String origin, long requestId) {
    this.deletionRequestedAt = requestedAt;
    this.deletionDueAt = dueAt;
    this.deletionOrigin = origin;
    this.deletionRequestId = requestId;
    this.tokenVersion++;
  }

  public void cancelDeletion() {
    this.deletionRequestedAt = null;
    this.deletionDueAt = null;
    this.deletionOrigin = null;
    this.deletionRequestId = null;
    this.tokenVersion++;
  }
}
