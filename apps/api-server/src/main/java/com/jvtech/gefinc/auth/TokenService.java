package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.common.config.AppProperties;
import com.jvtech.gefinc.common.security.RequestOrigin;
import com.jvtech.gefinc.common.security.RequestOriginProvider;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tokens opacos de renovação de sessão: aleatórios, guardados só como hash SHA-256, rotativos a
 * cada uso e agrupados em famílias — reusar um token já rotacionado revoga a família inteira. Cada
 * família é uma sessão em {@code auth_sessions} (o {@code family_id} é o {@code sid} do token de
 * acesso): o login a cria com a origem da requisição, a renovação marca o uso e desliza a validade,
 * e toda revogação de família marca também a sessão.
 */
@Service
public class TokenService {

  private static final SecureRandom RANDOM = new SecureRandom();

  private final RefreshTokenRepository repository;
  private final AuthSessionRepository sessions;
  private final RequestOriginProvider origins;
  private final AppProperties properties;
  private final Clock clock;

  public TokenService(
      RefreshTokenRepository repository,
      AuthSessionRepository sessions,
      RequestOriginProvider origins,
      AppProperties properties,
      Clock clock) {
    this.repository = repository;
    this.sessions = sessions;
    this.origins = origins;
    this.properties = properties;
    this.clock = clock;
  }

  /** Token aleatório de 256 bits em Base64 URL-safe, usado também nos links de redefinição. */
  public static String newRawToken() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  public static String hash(String rawToken) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(rawToken.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  /**
   * Abre uma nova família (um login) e a sessão correspondente, com IP, rótulo e tipo de cliente da
   * requisição corrente. Devolve o identificador da sessão e o token em texto puro, que nunca é
   * guardado.
   */
  @Transactional
  public Issued issueNewFamily(long userId) {
    Instant now = clock.instant();
    UUID familyId = UUID.randomUUID();
    Stored stored = store(userId, familyId, now);
    insertSession(familyId, userId, now, stored.expiresAt());
    return new Issued(familyId, stored.raw());
  }

  /**
   * Troca o token apresentado por um novo da mesma família. Sempre devolve o dono e a família
   * quando o token é conhecido, mesmo ao recusar (para a auditoria de quem tenta reverter uma
   * decisão administrativa): token desconhecido, expirado ou já rotacionado (nesse último caso a
   * família inteira é revogada). Aceitar marca o uso da sessão e desliza a validade; uma família
   * anterior à tabela de sessões ganha a linha aqui.
   */
  @Transactional
  public Rotation rotate(String rawToken) {
    Instant now = clock.instant();
    Optional<RefreshToken> found = repository.findByTokenHash(hash(rawToken));
    if (found.isEmpty()) {
      return Rotation.unknown();
    }
    RefreshToken current = found.get();
    if (current.isRevoked()) {
      repository.revokeFamily(current.getFamilyId(), now);
      sessions.revoke(current.getFamilyId(), now, RevokedBy.SYSTEM.name());
      return Rotation.refused(current.getUserId(), current.getFamilyId());
    }
    if (current.isExpired(now)) {
      return Rotation.refused(current.getUserId(), current.getFamilyId());
    }
    Stored next = store(current.getUserId(), current.getFamilyId(), now);
    current.revoke(now, next.id());
    if (sessions.touch(current.getFamilyId(), now, next.expiresAt()) == 0) {
      insertSession(current.getFamilyId(), current.getUserId(), now, next.expiresAt());
    }
    return Rotation.accepted(current.getUserId(), current.getFamilyId(), next.raw());
  }

  /** Encerra a sessão do token informado (logout); desconhecido é ignorado. */
  @Transactional
  public void revokeFamilyOf(String rawToken) {
    repository
        .findByTokenHash(hash(rawToken))
        .ifPresent(token -> revokeFamily(token.getFamilyId(), RevokedBy.USER));
  }

  /** Encerra uma sessão: os tokens de renovação da família e a linha em {@code auth_sessions}. */
  @Transactional
  public void revokeFamily(UUID familyId, RevokedBy by) {
    Instant now = clock.instant();
    repository.revokeFamily(familyId, now);
    sessions.revoke(familyId, now, by.name());
  }

  /** Encerra todas as sessões do usuário (famílias e linhas de {@code auth_sessions}). */
  @Transactional
  public void revokeAllOfUser(long userId, RevokedBy by) {
    Instant now = clock.instant();
    repository.revokeAllOfUser(userId, now);
    sessions.revokeAllOfUser(userId, now, by.name());
  }

  private void insertSession(UUID familyId, long userId, Instant now, Instant expiresAt) {
    RequestOrigin origin = origins.current();
    sessions.insertIfAbsent(
        familyId, userId, now, expiresAt, origin.ip(), origin.deviceLabel(), origin.clientKind());
  }

  private Stored store(long userId, UUID familyId, Instant now) {
    String raw = newRawToken();
    Instant expiresAt = now.plus(properties.security().refreshTokenTtl());
    RefreshToken token = new RefreshToken(userId, familyId, hash(raw), expiresAt, now);
    repository.saveAndFlush(token);
    return new Stored(token.getId(), raw, expiresAt);
  }

  /** Sessão aberta no login: seu identificador (o {@code sid}) e o token de renovação. */
  public record Issued(UUID familyId, String rawToken) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "Issued[REDACTED]";
    }
  }

  /**
   * Resultado de uma renovação. {@code userId} e {@code familyId} são nulos só para token
   * desconhecido; {@code newRawToken} só existe quando aceita.
   */
  public record Rotation(Long userId, UUID familyId, String newRawToken) {

    static Rotation unknown() {
      return new Rotation(null, null, null);
    }

    static Rotation refused(long userId, UUID familyId) {
      return new Rotation(userId, familyId, null);
    }

    static Rotation accepted(long userId, UUID familyId, String newRawToken) {
      return new Rotation(userId, familyId, newRawToken);
    }

    public boolean accepted() {
      return newRawToken != null;
    }

    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "Rotation[REDACTED]";
    }
  }

  private record Stored(long id, String raw, Instant expiresAt) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "Stored[REDACTED]";
    }
  }
}
