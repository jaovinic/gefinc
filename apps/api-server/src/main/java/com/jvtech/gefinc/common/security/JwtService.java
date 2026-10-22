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
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/** Emite e valida tokens de acesso JWT (HS256) de curta duração. */
@Service
public class JwtService {

  private static final String VERSION_CLAIM = "ver";
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

  public String issueAccessToken(long userId, int tokenVersion) {
    Instant now = clock.instant();
    return Jwts.builder()
        .subject(Long.toString(userId))
        .claim(VERSION_CLAIM, tokenVersion)
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plus(ttl)))
        .signWith(key)
        .compact();
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
          claims.getExpiration().toInstant());
    } catch (JwtException | IllegalArgumentException | NullPointerException e) {
      throw new InvalidTokenException("Token de acesso inválido", e);
    }
  }

  public long accessTokenTtlSeconds() {
    return ttl.toSeconds();
  }
}
