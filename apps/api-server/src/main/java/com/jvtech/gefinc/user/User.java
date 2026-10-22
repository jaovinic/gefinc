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

  @Column(name = "password_hash", nullable = false)
  private String passwordHash;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "deletion_requested_at")
  private Instant deletionRequestedAt;

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

  public String getPasswordHash() {
    return passwordHash;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getDeletionRequestedAt() {
    return deletionRequestedAt;
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

  /** Marca a exclusão e invalida de imediato os tokens de acesso já emitidos. */
  public void requestDeletion(Instant now) {
    this.deletionRequestedAt = now;
    this.tokenVersion++;
  }

  public void cancelDeletion() {
    this.deletionRequestedAt = null;
    this.tokenVersion++;
  }
}
