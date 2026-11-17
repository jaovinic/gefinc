package com.jvtech.gefinc.admin.parameter;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Parâmetro do sistema editável em tempo de execução (tabela {@code system_parameters}). Parâmetros
 * somente leitura não são linhas: vêm de {@code AppProperties} ou constantes.
 */
@Entity
@Table(name = "system_parameters")
public class SystemParameter {

  @Id
  @Column(name = "key", length = 30)
  private String key;

  @Column(name = "value", length = 500, nullable = false)
  private String value;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Column(name = "updated_by")
  private Long updatedBy;

  protected SystemParameter() {}

  public SystemParameter(String key, String value, Instant updatedAt, Long updatedBy) {
    this.key = key;
    this.value = value;
    this.updatedAt = updatedAt;
    this.updatedBy = updatedBy;
  }

  public String getKey() {
    return key;
  }

  public String getValue() {
    return value;
  }

  public void setValue(String value) {
    this.value = value;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(Instant updatedAt) {
    this.updatedAt = updatedAt;
  }

  public Long getUpdatedBy() {
    return updatedBy;
  }

  public void setUpdatedBy(Long updatedBy) {
    this.updatedBy = updatedBy;
  }
}
