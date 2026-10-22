package com.jvtech.gefinc.transaction;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Toda consulta é filtrada pelo usuário dono (Princípio III). */
public interface TransactionRepository extends JpaRepository<Transaction, Long> {

  Optional<Transaction> findByIdAndUserId(long id, long userId);

  List<Transaction> findByGroupIdAndUserIdOrderByInstallmentNumber(long groupId, long userId);

  @Query(
      "select coalesce(max(t.installmentNumber), 0) from Transaction t where t.groupId = :groupId")
  int maxInstallment(@Param("groupId") long groupId);

  @Query(
      "select count(t) > 0 from Transaction t where t.userId = :userId and t.categoryId = :categoryId")
  boolean existsByCategory(@Param("userId") long userId, @Param("categoryId") long categoryId);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      "update Transaction t set t.categoryId = :to where t.userId = :userId and t.categoryId = :from")
  int reassignCategory(
      @Param("userId") long userId, @Param("from") long from, @Param("to") long to);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      "update Transaction t set t.categoryId = :to where t.groupId = :groupId and t.userId = :userId"
          + " and t.status = com.jvtech.gefinc.transaction.TransactionStatus.PENDING")
  int reassignPendingOfGroup(
      @Param("groupId") long groupId, @Param("userId") long userId, @Param("to") long to);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      "delete from Transaction t where t.groupId = :groupId and t.userId = :userId"
          + " and t.status = com.jvtech.gefinc.transaction.TransactionStatus.PENDING")
  int deletePendingOfGroup(@Param("groupId") long groupId, @Param("userId") long userId);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      "delete from Transaction t where t.groupId = :groupId and t.userId = :userId"
          + " and t.status = com.jvtech.gefinc.transaction.TransactionStatus.PENDING"
          + " and t.referenceMonth > :afterMonth")
  int deletePendingAfter(
      @Param("groupId") long groupId,
      @Param("userId") long userId,
      @Param("afterMonth") LocalDate afterMonth);

  @Query(
      "select count(t) from Transaction t where t.groupId = :groupId and t.userId = :userId"
          + " and t.status = :status")
  long countByStatus(
      @Param("groupId") long groupId,
      @Param("userId") long userId,
      @Param("status") TransactionStatus status);

  @Query(
      "select coalesce(sum(t.amount), 0) from Transaction t where t.groupId = :groupId"
          + " and t.userId = :userId and t.status = :status")
  java.math.BigDecimal sumByStatus(
      @Param("groupId") long groupId,
      @Param("userId") long userId,
      @Param("status") TransactionStatus status);

  @Query(
      "select max(t.referenceMonth) from Transaction t where t.groupId = :groupId"
          + " and t.userId = :userId and t.status = com.jvtech.gefinc.transaction.TransactionStatus.PAID")
  LocalDate lastPaidMonth(@Param("groupId") long groupId, @Param("userId") long userId);

  // ---- Faturas de cartão (visão derivada: itens da conta no mês de referência) ----

  List<Transaction> findByUserIdAndAccountIdAndReferenceMonthOrderByDueDateAscIdAsc(
      long userId, long accountId, LocalDate referenceMonth);

  @Query(
      "select coalesce(sum(t.amount), 0) from Transaction t where t.userId = :userId"
          + " and t.accountId = :accountId and t.referenceMonth = :month")
  java.math.BigDecimal invoiceTotal(
      @Param("userId") long userId,
      @Param("accountId") long accountId,
      @Param("month") LocalDate month);

  @Query(
      "select coalesce(sum(t.amount), 0) from Transaction t where t.userId = :userId"
          + " and t.accountId = :accountId and t.referenceMonth = :month"
          + " and t.status = com.jvtech.gefinc.transaction.TransactionStatus.PAID"
          + " and t.settledByPaymentId is null")
  java.math.BigDecimal invoicePaidIndividually(
      @Param("userId") long userId,
      @Param("accountId") long accountId,
      @Param("month") LocalDate month);

  @Query(
      "select count(t) from Transaction t where t.userId = :userId and t.accountId = :accountId"
          + " and t.referenceMonth = :month")
  long invoiceItemCount(
      @Param("userId") long userId,
      @Param("accountId") long accountId,
      @Param("month") LocalDate month);

  @Query(
      "select max(t.dueDate) from Transaction t where t.userId = :userId"
          + " and t.accountId = :accountId and t.referenceMonth = :month")
  LocalDate invoiceLatestDueDate(
      @Param("userId") long userId,
      @Param("accountId") long accountId,
      @Param("month") LocalDate month);

  /**
   * Linhas {@code [accountId, referenceMonth, total, pagoIndividualmente]} no intervalo de meses.
   */
  @Query(
      "select t.accountId, t.referenceMonth, sum(t.amount),"
          + " sum(case when t.status = com.jvtech.gefinc.transaction.TransactionStatus.PAID"
          + " and t.settledByPaymentId is null then t.amount else 0 end)"
          + " from Transaction t where t.userId = :userId and t.accountId in :accounts"
          + " and t.referenceMonth between :from and :to group by t.accountId, t.referenceMonth")
  List<Object[]> invoiceTotalsByMonth(
      @Param("userId") long userId,
      @Param("accounts") java.util.Collection<Long> accounts,
      @Param("from") LocalDate from,
      @Param("to") LocalDate to);

  /** Quita os itens pendentes da fatura, registrando qual pagamento os quitou. */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      "update Transaction t set t.status = com.jvtech.gefinc.transaction.TransactionStatus.PAID,"
          + " t.paymentDate = :paidAt, t.settledByPaymentId = :paymentId, t.version = t.version + 1"
          + " where t.userId = :userId and t.accountId = :accountId and t.referenceMonth = :month"
          + " and t.status = com.jvtech.gefinc.transaction.TransactionStatus.PENDING")
  int settlePendingOfInvoice(
      @Param("userId") long userId,
      @Param("accountId") long accountId,
      @Param("month") LocalDate month,
      @Param("paymentId") long paymentId,
      @Param("paidAt") LocalDate paidAt);

  /** Devolve a pendente os itens que haviam sido quitados por pagamento de fatura. */
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      "update Transaction t set t.status = com.jvtech.gefinc.transaction.TransactionStatus.PENDING,"
          + " t.paymentDate = null, t.settledByPaymentId = null, t.version = t.version + 1"
          + " where t.userId = :userId and t.accountId = :accountId and t.referenceMonth = :month"
          + " and t.settledByPaymentId is not null")
  int revertSettledOfInvoice(
      @Param("userId") long userId,
      @Param("accountId") long accountId,
      @Param("month") LocalDate month);
}
