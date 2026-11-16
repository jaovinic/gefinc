package com.jvtech.gefinc.auth;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

  /** Com trava de escrita na linha do token: só depois de travar o usuário (ver AdminPolicy). */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  Optional<RefreshToken> findByTokenHash(String tokenHash);

  /** Dono do token, só leitura e sem trava: serve para travar o usuário antes do token. */
  @Query("select t.userId from RefreshToken t where t.tokenHash = :tokenHash")
  Optional<Long> findOwnerByTokenHash(@Param("tokenHash") String tokenHash);

  @Modifying
  @Query(
      "update RefreshToken t set t.revokedAt = :now"
          + " where t.familyId = :familyId and t.revokedAt is null")
  int revokeFamily(@Param("familyId") UUID familyId, @Param("now") Instant now);

  @Modifying
  @Query(
      "update RefreshToken t set t.revokedAt = :now"
          + " where t.userId = :userId and t.revokedAt is null")
  int revokeAllOfUser(@Param("userId") long userId, @Param("now") Instant now);
}
