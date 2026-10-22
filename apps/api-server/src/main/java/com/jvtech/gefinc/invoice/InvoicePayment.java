package com.jvtech.gefinc.invoice;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/** Pagamento (total ou parcial) de uma fatura de cartão. */
@Entity
@Table(name = "invoice_payments")
public class InvoicePayment {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false, updatable = false)
  private long userId;

  @Column(name = "account_id", nullable = false, updatable = false)
  private long accountId;

  @Column(name = "invoice_month", nullable = false, updatable = false)
  private LocalDate invoiceMonth;

  @Column(nullable = false, updatable = false, precision = 19, scale = 2)
  private BigDecimal amount;

  @Column(name = "paid_at", nullable = false, updatable = false)
  private LocalDate paidAt;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected InvoicePayment() {}

  public InvoicePayment(
      long userId,
      long accountId,
      LocalDate invoiceMonth,
      BigDecimal amount,
      LocalDate paidAt,
      Instant createdAt) {
    this.userId = userId;
    this.accountId = accountId;
    this.invoiceMonth = invoiceMonth;
    this.amount = amount;
    this.paidAt = paidAt;
    this.createdAt = createdAt;
  }

  public Long getId() {
    return id;
  }

  public long getUserId() {
    return userId;
  }

  public long getAccountId() {
    return accountId;
  }

  public LocalDate getInvoiceMonth() {
    return invoiceMonth;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public LocalDate getPaidAt() {
    return paidAt;
  }
}
