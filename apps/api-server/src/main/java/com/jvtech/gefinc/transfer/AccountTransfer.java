package com.jvtech.gefinc.transfer;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Transferência de saldo entre duas contas do mesmo usuário. Uma única linha representa a saída da
 * origem e a entrada no destino, de modo que as duas pontas nunca ficam dessincronizadas.
 */
@Entity
@Table(name = "account_transfers")
public class AccountTransfer {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false, updatable = false)
  private long userId;

  @Column(name = "from_account_id", nullable = false)
  private long fromAccountId;

  @Column(name = "to_account_id", nullable = false)
  private long toAccountId;

  @Column(nullable = false, precision = 19, scale = 2)
  private BigDecimal amount;

  @Column(name = "transfer_date", nullable = false)
  private LocalDate transferDate;

  @Column(length = 120)
  private String description;

  @Version private long version;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected AccountTransfer() {}

  public AccountTransfer(
      long userId,
      long fromAccountId,
      long toAccountId,
      BigDecimal amount,
      LocalDate transferDate,
      String description,
      Instant createdAt) {
    this.userId = userId;
    this.fromAccountId = fromAccountId;
    this.toAccountId = toAccountId;
    this.amount = amount;
    this.transferDate = transferDate;
    this.description = description;
    this.createdAt = createdAt;
  }

  /** Substitui os dados editáveis (PUT completo). */
  void change(
      long fromAccountId,
      long toAccountId,
      BigDecimal amount,
      LocalDate transferDate,
      String description) {
    this.fromAccountId = fromAccountId;
    this.toAccountId = toAccountId;
    this.amount = amount;
    this.transferDate = transferDate;
    this.description = description;
  }

  public Long getId() {
    return id;
  }

  public long getUserId() {
    return userId;
  }

  public long getFromAccountId() {
    return fromAccountId;
  }

  public long getToAccountId() {
    return toAccountId;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public LocalDate getTransferDate() {
    return transferDate;
  }

  public String getDescription() {
    return description;
  }

  public long getVersion() {
    return version;
  }

  /** Sem dados do usuário em logs: valores, datas e descrição nunca são impressos (FR-003). */
  @Override
  public String toString() {
    return "AccountTransfer[REDACTED]";
  }
}
