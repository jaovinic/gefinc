package com.jvtech.gefinc.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
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

  public void cancelDeletion() {
    this.deletionRequestedAt = null;
    this.deletionDueAt = null;
    this.deletionOrigin = null;
    this.deletionRequestId = null;
    this.tokenVersion++;
  }
}
