package com.jvtech.gefinc.admin.user;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PendingEmailChangeRepository extends JpaRepository<PendingEmailChange, Long> {

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from PendingEmailChange p where p.userId = :userId and p.status = 'PENDING'")
  Optional<PendingEmailChange> findPendingForUpdate(@Param("userId") long userId);

  @Query("select p from PendingEmailChange p where p.userId = :userId and p.status = 'PENDING'")
  Optional<PendingEmailChange> findPending(@Param("userId") long userId);

  @Query(
      "select count(p) > 0 from PendingEmailChange p where lower(p.newEmail) = lower(:newEmail) and"
          + " p.status = 'PENDING' and p.userId <> :userId")
  boolean existsPendingForOtherUser(
      @Param("newEmail") String newEmail, @Param("userId") long userId);
}
