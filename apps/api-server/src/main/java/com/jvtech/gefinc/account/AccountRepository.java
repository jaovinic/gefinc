package com.jvtech.gefinc.account;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Toda consulta é filtrada pelo usuário dono (Princípio III). */
public interface AccountRepository extends JpaRepository<Account, Long> {

  @Query("select a from Account a where a.userId = :userId order by lower(a.name)")
  List<Account> findAllOfUser(@Param("userId") long userId);

  @Query(
      "select a from Account a where a.userId = :userId and a.active = true order by lower(a.name)")
  List<Account> findActiveOfUser(@Param("userId") long userId);

  Optional<Account> findByIdAndUserId(long id, long userId);

  @Query(
      "select count(a) > 0 from Account a where a.userId = :userId and a.active = true"
          + " and lower(a.name) = lower(:name) and (:excludeId is null or a.id <> :excludeId)")
  boolean activeNameExists(
      @Param("userId") long userId, @Param("name") String name, @Param("excludeId") Long excludeId);
}
