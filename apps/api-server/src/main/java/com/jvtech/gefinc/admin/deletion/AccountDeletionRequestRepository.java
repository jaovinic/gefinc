package com.jvtech.gefinc.admin.deletion;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AccountDeletionRequestRepository
    extends JpaRepository<AccountDeletionRequest, Long> {

  @Query(
      "SELECT r FROM AccountDeletionRequest r WHERE r.userId = :userId AND r.status = 'SCHEDULED'")
  Optional<AccountDeletionRequest> findActiveByUserId(@Param("userId") long userId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query(
      "SELECT r FROM AccountDeletionRequest r WHERE r.userId = :userId AND r.status = 'SCHEDULED'")
  Optional<AccountDeletionRequest> findActiveByUserIdForUpdate(@Param("userId") long userId);

  @Query(
      "SELECT r FROM AccountDeletionRequest r WHERE r.status = 'SCHEDULED' AND r.dueAt <= :limit")
  List<AccountDeletionRequest> findDueScheduled(@Param("limit") Instant limit);

  @Query(
      "SELECT r FROM AccountDeletionRequest r WHERE r.userId = :userId ORDER BY r.requestedAt DESC, r.id DESC")
  List<AccountDeletionRequest> findByUserIdOrderByRequestedAtDesc(@Param("userId") long userId);
}
