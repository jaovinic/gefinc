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
import java.time.LocalDate;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Ocorrência individual (uma parcela ou uma competência mensal), com vencimento e status. */
@Entity
@Table(name = "transactions")
public class Transaction {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "group_id", nullable = false, updatable = false)
  private long groupId;

  @Column(name = "user_id", nullable = false, updatable = false)
  private long userId;

  @Column(name = "account_id", nullable = false, updatable = false)
  private long accountId;

  @Column(name = "category_id", nullable = false)
  private long categoryId;

  @JdbcTypeCode(SqlTypes.SMALLINT)
  @Column(name = "installment_number", nullable = false, updatable = false)
  private int installmentNumber;

  /**
   * Primeiro dia do mês do vencimento (o mês a que a ocorrência pertence no painel e nas faturas).
   */
  @Column(name = "reference_month", nullable = false)
  private LocalDate referenceMonth;

  @Column(nullable = false, precision = 19, scale = 2)
  private BigDecimal amount;

  @Column(name = "due_date", nullable = false)
  private LocalDate dueDate;

  @Column(name = "payment_date")
  private LocalDate paymentDate;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private TransactionStatus status = TransactionStatus.PENDING;

  /** Pagamento de fatura que quitou este item automaticamente; nulo se foi pago individualmente. */
  @Column(name = "settled_by_payment_id")
  private Long settledByPaymentId;

  @Version private long version;

  protected Transaction() {}

  public Transaction(
      long groupId,
      long userId,
      long accountId,
      long categoryId,
      int installmentNumber,
      BigDecimal amount,
      LocalDate dueDate) {
    this.groupId = groupId;
    this.userId = userId;
    this.accountId = accountId;
    this.categoryId = categoryId;
    this.installmentNumber = installmentNumber;
    this.amount = amount;
    reschedule(dueDate);
  }

  public Long getId() {
    return id;
  }

  public long getGroupId() {
    return groupId;
  }

  public long getUserId() {
    return userId;
  }

  public long getAccountId() {
    return accountId;
  }

  public long getCategoryId() {
    return categoryId;
  }

  public int getInstallmentNumber() {
    return installmentNumber;
  }

  public LocalDate getReferenceMonth() {
    return referenceMonth;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public LocalDate getPaymentDate() {
    return paymentDate;
  }

  public TransactionStatus getStatus() {
    return status;
  }

  public long getVersion() {
    return version;
  }

  public Long getSettledByPaymentId() {
    return settledByPaymentId;
  }

  public boolean isPaid() {
    return status == TransactionStatus.PAID;
  }

  public void setCategoryId(long categoryId) {
    this.categoryId = categoryId;
  }

  public void setAmount(BigDecimal amount) {
    this.amount = amount;
  }

  /** Muda o vencimento e o mês de referência juntos. */
  public void reschedule(LocalDate dueDate) {
    this.dueDate = dueDate;
    this.referenceMonth = dueDate.withDayOfMonth(1);
  }

  public void markPaid(LocalDate paymentDate) {
    this.status = TransactionStatus.PAID;
    this.paymentDate = paymentDate;
  }

  public void markPending() {
    this.status = TransactionStatus.PENDING;
    this.paymentDate = null;
    this.settledByPaymentId = null;
  }
}
