package com.jvtech.gefinc.auth;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface AuthSessionRepository extends JpaRepository<AuthSession, UUID> {

  /**
   * Cria a sessão se ainda não existe (login, ou primeira renovação de uma família anterior à
   * tabela). Devolve 1 se criou, 0 se já existia.
   */
  @Modifying
  @Query(
      value =
          """
          INSERT INTO auth_sessions (id, user_id, created_at, last_used_at, expires_at, client_ip,
                                     device_label, client_kind)
          VALUES (:id, :userId, :now, :now, :expiresAt, CAST(:ip AS VARCHAR(45)),
                  CAST(:device AS VARCHAR(80)), :kind)
          ON CONFLICT (id) DO NOTHING
          """,
      nativeQuery = true)
  int insertIfAbsent(
      @Param("id") UUID id,
      @Param("userId") long userId,
      @Param("now") Instant now,
      @Param("expiresAt") Instant expiresAt,
      @Param("ip") String ip,
      @Param("device") String device,
      @Param("kind") String kind);

  /**
   * Renovação: marca o uso e desliza a validade, só de sessão aberta (não encerrada e não
   * expirada). Devolve 0 se a sessão não tem linha OU se está encerrada ou expirada; quem chama
   * distingue os dois casos com {@code existsById}. O filtro vive no próprio {@code UPDATE}, então
   * uma sessão encerrada por outra transação enquanto esta esperava a linha também dá 0.
   */
  @Modifying
  @Query(
      "update AuthSession s set s.lastUsedAt = :now, s.expiresAt = :expiresAt"
          + " where s.id = :id and s.revokedAt is null and s.expiresAt > :now")
  int touch(@Param("id") UUID id, @Param("now") Instant now, @Param("expiresAt") Instant expiresAt);

  @Modifying
  @Query(
      "update AuthSession s set s.revokedAt = :now, s.revokedBy = :by"
          + " where s.id = :id and s.revokedAt is null")
  int revoke(@Param("id") UUID id, @Param("now") Instant now, @Param("by") String by);

  @Modifying
  @Query(
      "update AuthSession s set s.revokedAt = :now, s.revokedBy = :by"
          + " where s.userId = :userId and s.revokedAt is null")
  int revokeAllOfUser(
      @Param("userId") long userId, @Param("now") Instant now, @Param("by") String by);

  Optional<AuthSession> findByIdAndUserId(UUID id, long userId);

  /** Sessões abertas (não encerradas e não expiradas), da mais recente para a mais antiga. */
  @Query(
      "select s from AuthSession s where s.userId = :userId and s.revokedAt is null"
          + " and s.expiresAt > :now order by s.createdAt desc, s.id desc")
  List<AuthSession> findOpenOfUser(@Param("userId") long userId, @Param("now") Instant now);

  /** Remove as sessões expiradas ou encerradas antes do limite (rotina diária). */
  @Transactional
  @Modifying
  @Query("delete from AuthSession s where s.expiresAt < :limit or s.revokedAt < :limit")
  int deleteInactiveBefore(@Param("limit") Instant limit);

  /** Conta sessões abertas elegíveis para revogação global em emergência. */
  @Query(
      "select count(s) from AuthSession s where s.revokedAt is null and s.expiresAt > :now"
          + " and (:mySessionId is null or s.id <> :mySessionId)"
          + " and s.userId not in (select u.id from User u where u.role = com.jvtech.gefinc.user.UserRole.ROOT)")
  int countOpenGlobal(@Param("now") Instant now, @Param("mySessionId") UUID mySessionId);

  /** Encerra em massa todas as sessões exceto as dos raízes e a sessão atual do administrador. */
  @Modifying
  @Query(
      "update AuthSession s set s.revokedAt = :now, s.revokedBy = :by"
          + " where s.revokedAt is null"
          + " and (:mySessionId is null or s.id <> :mySessionId)"
          + " and s.userId not in (select u.id from User u where u.role = com.jvtech.gefinc.user.UserRole.ROOT)")
  int revokeAllGlobal(
      @Param("now") Instant now, @Param("by") String by, @Param("mySessionId") UUID mySessionId);
}
