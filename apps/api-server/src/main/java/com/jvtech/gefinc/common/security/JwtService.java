package com.jvtech.gefinc.common.security;

import com.jvtech.gefinc.common.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/** Emite e valida tokens de acesso JWT (HS256) de curta duração. */
@Service
public class JwtService {

  private static final String VERSION_CLAIM = "ver";
  private static final String SESSION_CLAIM = "sid";
  private static final int MIN_SECRET_BYTES = 32;

  private final SecretKey key;
  private final Duration ttl;
  private final Clock clock;

  @Autowired
  public JwtService(AppProperties properties, Clock clock) {
    this(properties.security().jwtSecret(), properties.security().accessTokenTtl(), clock);
  }

  public JwtService(String secret, Duration ttl, Clock clock) {
    byte[] bytes = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
    if (bytes.length < MIN_SECRET_BYTES) {
      throw new IllegalArgumentException(
          "O segredo do JWT deve ter pelo menos " + MIN_SECRET_BYTES + " bytes");
    }
    this.key = Keys.hmacShaKeyFor(bytes);
    this.ttl = ttl;
    this.clock = clock;
  }

  /** Token sem sessão: formato anterior ao painel, que vale até expirar. */
  public String issueAccessToken(long userId, int tokenVersion) {
    return issueAccessToken(userId, tokenVersion, null);
  }

  /**
   * Token de acesso preso a uma sessão: a claim {@code sid} é o {@code family_id} da família de
   * tokens de renovação e a requisição só vale enquanto a sessão estiver aberta.
   */
  public String issueAccessToken(long userId, int tokenVersion, UUID sessionId) {
    Instant now = clock.instant();
    var builder =
        Jwts.builder()
            .subject(Long.toString(userId))
            .claim(VERSION_CLAIM, tokenVersion)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(ttl)));
    if (sessionId != null) {
      builder.claim(SESSION_CLAIM, sessionId.toString());
    }
    return builder.signWith(key).compact();
  }

  public AccessTokenClaims parse(String token) {
    try {
      Claims claims =
          Jwts.parser()
              .verifyWith(key)
              .clock(() -> Date.from(clock.instant()))
              .build()
              .parseSignedClaims(token)
              .getPayload();
      return new AccessTokenClaims(
          Long.parseLong(claims.getSubject()),
          claims.get(VERSION_CLAIM, Integer.class),
          sessionId(claims),
          claims.getExpiration().toInstant());
    } catch (JwtException | IllegalArgumentException | NullPointerException e) {
      throw new InvalidTokenException("Token de acesso inválido", e);
    }
  }

  private static UUID sessionId(Claims claims) {
    String sid = claims.get(SESSION_CLAIM, String.class);
    return sid == null ? null : UUID.fromString(sid);
  }

  public long accessTokenTtlSeconds() {
    return ttl.toSeconds();
  }
}
