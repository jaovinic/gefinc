package com.jvtech.gefinc.admin.invitation;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvitationRepository extends JpaRepository<Invitation, Long> {

  Optional<Invitation> findByTokenHash(String tokenHash);

  @Query("SELECT i FROM Invitation i WHERE lower(i.email) = lower(:email) AND i.status = :status")
  Optional<Invitation> findByEmailAndStatus(
      @Param("email") String email, @Param("status") InvitationStatus status);

  List<Invitation> findAllByOrderByCreatedAtDescIdDesc();

  List<Invitation> findByStatusOrderByCreatedAtDescIdDesc(InvitationStatus status);

  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query(
      "UPDATE Invitation i SET i.status = :expiredStatus, i.email = NULL, i.resolvedAt = :now"
          + " WHERE i.status = :pendingStatus AND i.expiresAt < :now")
  int expirePendingBefore(
      @Param("pendingStatus") InvitationStatus pendingStatus,
      @Param("expiredStatus") InvitationStatus expiredStatus,
      @Param("now") Instant now);
}
