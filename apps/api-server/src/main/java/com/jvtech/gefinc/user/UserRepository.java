package com.jvtech.gefinc.user;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

  @Query("select u from User u where lower(u.email) = lower(:email)")
  Optional<User> findByEmail(@Param("email") String email);

  @Query("select count(u) > 0 from User u where lower(u.email) = lower(:email)")
  boolean existsByEmail(@Param("email") String email);

  /** Estado mínimo para validar um token de acesso (consulta leve a cada requisição). */
  Optional<TokenStateView> findProjectedById(Long id);

  /** Remove definitivamente as contas com carência vencida; o banco apaga os dados em cascata. */
  @Modifying
  @Query("delete from User u where u.deletionRequestedAt <= :limit")
  int deleteExpiredDeletions(@Param("limit") Instant limit);

  interface TokenStateView {
    int getTokenVersion();

    Instant getDeletionRequestedAt();
  }
}
