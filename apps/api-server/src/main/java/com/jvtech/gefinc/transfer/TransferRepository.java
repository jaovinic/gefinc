package com.jvtech.gefinc.transfer;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Toda consulta é filtrada pelo usuário dono (Princípio III). */
public interface TransferRepository extends JpaRepository<AccountTransfer, Long> {

  Optional<AccountTransfer> findByIdAndUserId(long id, long userId);

  /**
   * Transferências do período, da mais recente para a mais antiga; com {@code accountId}, só as que
   * têm a conta como origem ou destino.
   */
  @Query(
      "select t from AccountTransfer t where t.userId = :userId"
          + " and t.transferDate between :from and :to"
          + " and (:accountId is null or t.fromAccountId = :accountId"
          + " or t.toAccountId = :accountId) order by t.transferDate desc, t.id desc")
  Page<AccountTransfer> search(
      @Param("userId") long userId,
      @Param("from") LocalDate from,
      @Param("to") LocalDate to,
      @Param("accountId") Long accountId,
      Pageable pageable);

  /** Transferências em que a conta é origem ou destino (impede a exclusão da conta). */
  @Query(
      "select count(t) from AccountTransfer t where t.userId = :userId"
          + " and (t.fromAccountId = :accountId or t.toAccountId = :accountId)")
  long countByAccount(@Param("userId") long userId, @Param("accountId") long accountId);

  /** Linhas {@code [contaDeDestino, soma]} das transferências com data até o limite (inclusive). */
  @Query(
      "select t.toAccountId, sum(t.amount) from AccountTransfer t where t.userId = :userId"
          + " and t.transferDate <= :until group by t.toAccountId")
  List<Object[]> receivedUntil(@Param("userId") long userId, @Param("until") LocalDate until);

  /** Linhas {@code [contaDeOrigem, soma]} das transferências com data até o limite (inclusive). */
  @Query(
      "select t.fromAccountId, sum(t.amount) from AccountTransfer t where t.userId = :userId"
          + " and t.transferDate <= :until group by t.fromAccountId")
  List<Object[]> sentUntil(@Param("userId") long userId, @Param("until") LocalDate until);
}
