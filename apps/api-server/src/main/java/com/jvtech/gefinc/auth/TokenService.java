package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.common.config.AppProperties;
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
 * cada uso e agrupados em famílias — reusar um token já rotacionado revoga a família inteira.
 */
@Service
public class TokenService {

  private static final SecureRandom RANDOM = new SecureRandom();

  private final RefreshTokenRepository repository;
  private final AppProperties properties;
  private final Clock clock;

  public TokenService(RefreshTokenRepository repository, AppProperties properties, Clock clock) {
    this.repository = repository;
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

  /** Abre uma nova família (um login) e devolve o token em texto puro, que nunca é guardado. */
  @Transactional
  public String issueNewFamily(long userId) {
    return store(userId, UUID.randomUUID(), clock.instant()).raw();
  }

  /**
   * Troca o token apresentado por um novo da mesma família. Retorna vazio se o token é
   * desconhecido, expirado ou já rotacionado (nesse último caso a família inteira é revogada).
   */
  @Transactional
  public Optional<Rotation> rotate(String rawToken) {
    Instant now = clock.instant();
    Optional<RefreshToken> found = repository.findByTokenHash(hash(rawToken));
    if (found.isEmpty()) {
      return Optional.empty();
    }
    RefreshToken current = found.get();
    if (current.isRevoked()) {
      repository.revokeFamily(current.getFamilyId(), now);
      return Optional.empty();
    }
    if (current.isExpired(now)) {
      return Optional.empty();
    }
    Stored next = store(current.getUserId(), current.getFamilyId(), now);
    current.revoke(now, next.id());
    return Optional.of(new Rotation(current.getUserId(), next.raw()));
  }

  /** Revoga a família do token informado (logout); desconhecido é ignorado. */
  @Transactional
  public void revokeFamilyOf(String rawToken) {
    repository
        .findByTokenHash(hash(rawToken))
        .ifPresent(token -> repository.revokeFamily(token.getFamilyId(), clock.instant()));
  }

  @Transactional
  public void revokeAllOfUser(long userId) {
    repository.revokeAllOfUser(userId, clock.instant());
  }

  private Stored store(long userId, UUID familyId, Instant now) {
    String raw = newRawToken();
    RefreshToken token =
        new RefreshToken(
            userId, familyId, hash(raw), now.plus(properties.security().refreshTokenTtl()), now);
    repository.saveAndFlush(token);
    return new Stored(token.getId(), raw);
  }

  public record Rotation(long userId, String newRawToken) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "Rotation[REDACTED]";
    }
  }

  private record Stored(long id, String raw) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "Stored[REDACTED]";
    }
  }
}
