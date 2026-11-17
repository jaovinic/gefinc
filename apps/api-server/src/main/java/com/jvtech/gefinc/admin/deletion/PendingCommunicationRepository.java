package com.jvtech.gefinc.admin.deletion;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PendingCommunicationRepository extends JpaRepository<PendingCommunication, Long> {

  List<PendingCommunication> findAllByStateOrderByCreatedAtDesc(String state);

  long countByState(String state);

  List<PendingCommunication> findByUserIdAndState(long userId, String state);

  @Query(
      "SELECT c FROM PendingCommunication c WHERE c.state = 'PENDING' AND c.retainedUntil IS NOT NULL"
          + " AND c.retainedUntil <= :limit")
  List<PendingCommunication> findExpired(@Param("limit") Instant limit);

  @Query("SELECT c FROM PendingCommunication c WHERE c.deletionRequestId = :requestId")
  Optional<PendingCommunication> findByDeletionRequestId(@Param("requestId") long requestId);
}
