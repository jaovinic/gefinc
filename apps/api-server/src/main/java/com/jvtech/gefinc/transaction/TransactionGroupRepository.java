package com.jvtech.gefinc.transaction;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TransactionGroupRepository extends JpaRepository<TransactionGroup, Long> {

  Optional<TransactionGroup> findByIdAndUserId(long id, long userId);

  /** Grupos fixos de um cartão, para recalcular os vencimentos quando os dias do cartão mudam. */
  @Query(
      "select g from TransactionGroup g where g.userId = :userId and g.accountId = :accountId"
          + " and g.recurrenceType = com.jvtech.gefinc.transaction.RecurrenceType.FIXED")
  List<TransactionGroup> findFixedOfAccount(
      @Param("userId") long userId, @Param("accountId") long accountId);

  /**
   * Rotina de sistema (sem usuário): grupos fixos em contas ativas, candidatos a completar a janela
   * de ocorrências.
   */
  @Query(
      "select g from TransactionGroup g, Account a where a.id = g.accountId and a.userId = g.userId"
          + " and a.active = true and g.recurrenceType = com.jvtech.gefinc.transaction.RecurrenceType.FIXED")
  List<TransactionGroup> findFixedOfActiveAccounts();

  @Query(
      "select count(g) from TransactionGroup g where g.userId = :userId and g.categoryId = :categoryId")
  long countByCategory(@Param("userId") long userId, @Param("categoryId") long categoryId);

  @Query(
      "select count(g) from TransactionGroup g where g.userId = :userId and g.accountId = :accountId")
  long countByAccount(@Param("userId") long userId, @Param("accountId") long accountId);
}
