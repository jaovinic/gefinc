package com.jvtech.gefinc.auth;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

  /** Com trava de escrita (uso único): só depois de travar o usuário (ver AdminPolicy). */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  Optional<PasswordResetToken> findByTokenHash(String tokenHash);

  /** Dono do link, só leitura e sem trava: serve para travar o usuário antes do link. */
  @Query("select t.userId from PasswordResetToken t where t.tokenHash = :tokenHash")
  Optional<Long> findOwnerByTokenHash(@Param("tokenHash") String tokenHash);

  /** Uma nova solicitação (ou uma redefinição concluída) inutiliza os links ainda abertos. */
  @Modifying
  @Query(
      "update PasswordResetToken t set t.usedAt = :now"
          + " where t.userId = :userId and t.usedAt is null")
  int invalidateOpenTokens(@Param("userId") long userId, @Param("now") Instant now);
}
