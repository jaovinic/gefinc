package com.jvtech.gefinc.user;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

  @Query("select u from User u where lower(u.email) = lower(:email)")
  Optional<User> findByEmail(@Param("email") String email);

  @Query("select count(u) > 0 from User u where lower(u.email) = lower(:email)")
  boolean existsByEmail(@Param("email") String email);

  /**
   * Estado do usuário e da sessão para validar um token de acesso: uma só consulta a cada
   * requisição, com a junção em {@code auth_sessions} pela chave primária e sem escrita. O instante
   * vem do {@code Clock} da aplicação (nunca de {@code now()}), então a expiração da sessão é
   * testável. Os aliases vão entre aspas porque o PostgreSQL os converte para minúsculas.
   */
  @Query(
      value =
          """
          SELECT u.token_version AS "tokenVersion",
                 (u.deletion_requested_at IS NOT NULL) AS "deletionPending",
                 (u.suspended_at IS NOT NULL) AS "suspended",
                 u.role AS "role",
                 (s.id IS NOT NULL) AS "sessionFound",
                 (s.revoked_at IS NOT NULL) AS "sessionRevoked",
                 COALESCE(s.expires_at <= :now, FALSE) AS "sessionExpired"
          FROM users u
          LEFT JOIN auth_sessions s ON s.id = :sid AND s.user_id = u.id
          WHERE u.id = :uid
          """,
      nativeQuery = true)
  Optional<UserAuthState> findAuthState(
      @Param("uid") long userId, @Param("sid") UUID sessionId, @Param("now") Instant now);

  /** Carrega o usuário com bloqueio de escrita (serializa mudanças concorrentes da mesma conta). */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select u from User u where u.id = :id")
  Optional<User> findForUpdate(@Param("id") long id);

  /**
   * Administradores ativos (papel ADMIN ou ROOT, sem suspensão e sem exclusão pendente), exceto o
   * informado. Só é confiável sob a trava consultiva do conjunto de administradores.
   */
  @Query(
      "select count(u) from User u where u.id <> :excludedId and u.role <> "
          + "com.jvtech.gefinc.user.UserRole.USER and u.suspendedAt is null"
          + " and u.deletionRequestedAt is null")
  long countActiveAdminsExcluding(@Param("excludedId") long excludedId);

  /**
   * Registra o último acesso (login e renovação da sessão) sem carregar nem sujar a entidade: o
   * UPDATE grava só esta coluna, então não concorre com troca de papel, suspensão ou versão do
   * token.
   */
  @Modifying
  @Query("update User u set u.lastAccessAt = :at where u.id = :id")
  int touchAccess(@Param("id") long id, @Param("at") Instant at);

  /** Remove definitivamente as contas com carência vencida; o banco apaga os dados em cascata. */
  @Modifying
  @Query("delete from User u where u.deletionRequestedAt <= :limit")
  int deleteExpiredDeletions(@Param("limit") Instant limit);

  /** Projeção de {@link #findAuthState}. */
  interface UserAuthState {
    int getTokenVersion();

    boolean getDeletionPending();

    boolean getSuspended();

    String getRole();

    boolean getSessionFound();

    boolean getSessionRevoked();

    boolean getSessionExpired();
  }
}
