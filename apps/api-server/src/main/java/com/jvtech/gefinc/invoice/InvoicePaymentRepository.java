package com.jvtech.gefinc.invoice;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Toda consulta é filtrada pelo usuário dono (Princípio III). */
public interface InvoicePaymentRepository extends JpaRepository<InvoicePayment, Long> {

  Optional<InvoicePayment> findByIdAndUserId(long id, long userId);

  List<InvoicePayment> findByUserIdAndAccountIdAndInvoiceMonthOrderByIdAsc(
      long userId, long accountId, LocalDate invoiceMonth);

  long countByUserIdAndAccountId(long userId, long accountId);

  boolean existsByUserIdAndAccountIdAndInvoiceMonth(
      long userId, long accountId, LocalDate invoiceMonth);

  @Query(
      "select coalesce(sum(p.amount), 0) from InvoicePayment p where p.userId = :userId"
          + " and p.accountId = :accountId and p.invoiceMonth = :month")
  BigDecimal sumOf(
      @Param("userId") long userId,
      @Param("accountId") long accountId,
      @Param("month") LocalDate month);

  /** Linhas {@code [accountId, invoiceMonth, soma]} dos pagamentos no intervalo de meses. */
  @Query(
      "select p.accountId, p.invoiceMonth, sum(p.amount) from InvoicePayment p"
          + " where p.userId = :userId and p.accountId in :accounts"
          + " and p.invoiceMonth between :from and :to group by p.accountId, p.invoiceMonth")
  List<Object[]> sumsByMonth(
      @Param("userId") long userId,
      @Param("accounts") Collection<Long> accounts,
      @Param("from") LocalDate from,
      @Param("to") LocalDate to);

  /** Linhas {@code [accountId, soma]} dos pagamentos de fatura feitos até a data (inclusive). */
  @Query(
      "select p.accountId, sum(p.amount) from InvoicePayment p where p.userId = :userId"
          + " and p.paidAt <= :until group by p.accountId")
  List<Object[]> sumsPaidUntil(@Param("userId") long userId, @Param("until") LocalDate until);
}
