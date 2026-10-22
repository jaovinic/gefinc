package com.jvtech.gefinc.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "accounts")
public class Account {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false, updatable = false)
  private long userId;

  @Column(nullable = false)
  private String name;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, updatable = false)
  private AccountType type;

  @JdbcTypeCode(SqlTypes.SMALLINT)
  @Column(name = "closing_day")
  private Integer closingDay;

  @JdbcTypeCode(SqlTypes.SMALLINT)
  @Column(name = "due_day")
  private Integer dueDay;

  @Column(nullable = false)
  private boolean active = true;

  @Version private long version;

  protected Account() {}

  public Account(long userId, String name, AccountType type, Integer closingDay, Integer dueDay) {
    this.userId = userId;
    this.name = name;
    this.type = type;
    this.closingDay = closingDay;
    this.dueDay = dueDay;
  }

  public Long getId() {
    return id;
  }

  public long getUserId() {
    return userId;
  }

  public String getName() {
    return name;
  }

  public AccountType getType() {
    return type;
  }

  public Integer getClosingDay() {
    return closingDay;
  }

  public Integer getDueDay() {
    return dueDay;
  }

  public boolean isActive() {
    return active;
  }

  public long getVersion() {
    return version;
  }

  public boolean isCreditCard() {
    return type == AccountType.CREDIT_CARD;
  }

  public void rename(String name) {
    this.name = name;
  }

  public void changeDays(Integer closingDay, Integer dueDay) {
    this.closingDay = closingDay;
    this.dueDay = dueDay;
  }

  public void setActive(boolean active) {
    this.active = active;
  }
}
