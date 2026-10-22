package com.jvtech.gefinc.transaction;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Origem de um conjunto de ocorrências: um avulso, um lançamento fixo mensal ou um parcelamento.
 */
@Entity
@Table(name = "transaction_groups")
public class TransactionGroup {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false, updatable = false)
  private long userId;

  @Column(nullable = false)
  private String description;

  @Enumerated(EnumType.STRING)
  @Column(name = "recurrence_type", nullable = false, updatable = false)
  private RecurrenceType recurrenceType;

  @JdbcTypeCode(SqlTypes.SMALLINT)
  @Column(name = "total_installments", nullable = false, updatable = false)
  private int totalInstallments;

  /** Valor total (parcelado), valor mensal atual (fixo) ou valor único (avulso). */
  @Column(name = "total_amount", nullable = false, precision = 19, scale = 2)
  private BigDecimal totalAmount;

  @Column(name = "account_id", nullable = false, updatable = false)
  private long accountId;

  @Column(name = "category_id", nullable = false)
  private long categoryId;

  @Column(name = "purchase_date", nullable = false, updatable = false)
  private LocalDate purchaseDate;

  @Column(name = "first_due_date", nullable = false, updatable = false)
  private LocalDate firstDueDate;

  /** Primeiro dia do último mês com ocorrência; só para lançamentos fixos encerrados. */
  @Column(name = "end_month")
  private LocalDate endMonth;

  @Version private long version;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected TransactionGroup() {}

  public TransactionGroup(
      long userId,
      String description,
      RecurrenceType recurrenceType,
      int totalInstallments,
      BigDecimal totalAmount,
      long accountId,
      long categoryId,
      LocalDate purchaseDate,
      LocalDate firstDueDate,
      Instant createdAt) {
    this.userId = userId;
    this.description = description;
    this.recurrenceType = recurrenceType;
    this.totalInstallments = totalInstallments;
    this.totalAmount = totalAmount;
    this.accountId = accountId;
    this.categoryId = categoryId;
    this.purchaseDate = purchaseDate;
    this.firstDueDate = firstDueDate;
    this.createdAt = createdAt;
  }

  public Long getId() {
    return id;
  }

  public long getUserId() {
    return userId;
  }

  public String getDescription() {
    return description;
  }

  public RecurrenceType getRecurrenceType() {
    return recurrenceType;
  }

  public int getTotalInstallments() {
    return totalInstallments;
  }

  public BigDecimal getTotalAmount() {
    return totalAmount;
  }

  public long getAccountId() {
    return accountId;
  }

  public long getCategoryId() {
    return categoryId;
  }

  public LocalDate getPurchaseDate() {
    return purchaseDate;
  }

  public LocalDate getFirstDueDate() {
    return firstDueDate;
  }

  public LocalDate getEndMonth() {
    return endMonth;
  }

  public long getVersion() {
    return version;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public void setCategoryId(long categoryId) {
    this.categoryId = categoryId;
  }

  public void setTotalAmount(BigDecimal totalAmount) {
    this.totalAmount = totalAmount;
  }

  public void setEndMonth(LocalDate endMonth) {
    this.endMonth = endMonth;
  }
}
