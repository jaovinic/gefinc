package com.jvtech.gefinc.admin.deletion;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Motivo selecionado pelo administrador ao solicitar a exclusão de uma conta (US11, V14). A
 * mensagem é genérica e mostrada ao usuário (nunca a justificativa livre). Nenhum registro é
 * apagado fisicamente (sem DELETE).
 */
@Entity
@Table(name = "deletion_reasons")
public class DeletionReason {

  public static final int NAME_MAX = 80;
  public static final int MESSAGE_MAX = 500;

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = NAME_MAX)
  private String name;

  @Column(nullable = false, length = MESSAGE_MAX)
  private String message;

  @Column(nullable = false)
  private boolean active;

  @Column(nullable = false)
  private boolean initial;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected DeletionReason() {}

  public DeletionReason(String name, String message, boolean initial, Instant now) {
    this.name = name.strip();
    this.message = message.strip();
    this.active = true;
    this.initial = initial;
    this.createdAt = now;
    this.updatedAt = now;
  }

  public Long getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public String getMessage() {
    return message;
  }

  public boolean isActive() {
    return active;
  }

  public boolean isInitial() {
    return initial;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void update(String name, String message, Instant now) {
    this.name = name.strip();
    this.message = message.strip();
    this.updatedAt = now;
  }

  public void deactivate(Instant now) {
    this.active = false;
    this.updatedAt = now;
  }

  public void activate(Instant now) {
    this.active = true;
    this.updatedAt = now;
  }
}
