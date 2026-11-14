package com.jvtech.gefinc.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jvtech.gefinc.support.MutableClock;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class JwtServiceTest {

  private static final String SECRET = "0123456789abcdef0123456789abcdef";
  private static final Instant START = Instant.parse("2026-11-01T12:00:00Z");

  private MutableClock clock;
  private JwtService service;

  @BeforeEach
  void setUp() {
    clock = new MutableClock(START);
    service = new JwtService(SECRET, Duration.ofMinutes(15), clock);
  }

  @Test
  void emiteEValidaOTokenComUsuarioEVersao() {
    String token = service.issueAccessToken(42L, 3);

    AccessTokenClaims claims = service.parse(token);

    assertThat(claims.userId()).isEqualTo(42L);
    assertThat(claims.tokenVersion()).isEqualTo(3);
    assertThat(claims.expiresAt()).isEqualTo(START.plus(Duration.ofMinutes(15)));
  }

  @Test
  void informaAValidadeEmSegundos() {
    assertThat(service.accessTokenTtlSeconds()).isEqualTo(900);
  }

  @Test
  void aindaValeUmSegundoAntesDeExpirar() {
    String token = service.issueAccessToken(1L, 0);

    clock.advance(Duration.ofMinutes(14).plusSeconds(59));

    assertThat(service.parse(token).userId()).isEqualTo(1L);
  }

  @Test
  void expiraAposQuinzeMinutos() {
    String token = service.issueAccessToken(1L, 0);

    clock.advance(Duration.ofMinutes(15).plusSeconds(1));

    assertThatThrownBy(() -> service.parse(token)).isInstanceOf(InvalidTokenException.class);
  }

  @Test
  void rejeitaTokenAdulterado() {
    String token = service.issueAccessToken(1L, 0);
    String tampered = token.substring(0, token.length() - 2) + (token.endsWith("AA") ? "BB" : "AA");

    assertThatThrownBy(() -> service.parse(tampered)).isInstanceOf(InvalidTokenException.class);
  }

  @Test
  void rejeitaTokenAssinadoComOutraChave() {
    JwtService other =
        new JwtService("ffffffffffffffffffffffffffffffff", Duration.ofMinutes(15), clock);

    String foreign = other.issueAccessToken(1L, 0);

    assertThatThrownBy(() -> service.parse(foreign)).isInstanceOf(InvalidTokenException.class);
  }

  @Test
  void rejeitaTextoQueNaoEUmToken() {
    assertThatThrownBy(() -> service.parse("isso-nao-e-um-jwt"))
        .isInstanceOf(InvalidTokenException.class);
  }

  @Test
  void recusaSegredoCurto() {
    assertThatThrownBy(() -> new JwtService("curto", Duration.ofMinutes(15), clock))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void emiteEValidaAClaimSidDaSessao() {
    UUID sid = UUID.randomUUID();

    AccessTokenClaims claims = service.parse(service.issueAccessToken(42L, 3, sid));

    assertThat(claims.userId()).isEqualTo(42L);
    assertThat(claims.tokenVersion()).isEqualTo(3);
    assertThat(claims.sessionId()).isEqualTo(sid);
    assertThat(claims.expiresAt()).isEqualTo(START.plus(Duration.ofMinutes(15)));
  }

  @Test
  void tokenEmitidoSemSidContinuaValidoEVemSemSessao() {
    AccessTokenClaims claims = service.parse(service.issueAccessToken(42L, 3));

    assertThat(claims.sessionId()).isNull();
    assertThat(claims.userId()).isEqualTo(42L);
  }

  @Test
  void aClaimSidFicaNoCorpoAssinadoSemOutroDadoDoUsuario() throws Exception {
    UUID sid = UUID.randomUUID();
    String token = service.issueAccessToken(7L, 1, sid);

    String payload =
        new String(
            java.util.Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);

    assertThat(payload).contains("\"sid\":\"" + sid + "\"");
    assertThat(payload).doesNotContain("email").doesNotContain("role");
  }

  @Test
  void sidQueNaoEUmUuidNaoValeMesmoComAssinaturaCorreta() {
    String forged =
        Jwts.builder()
            .subject("1")
            .claim("ver", 0)
            .claim("sid", "isto-nao-e-um-uuid")
            .issuedAt(Date.from(START))
            .expiration(Date.from(START.plus(Duration.ofMinutes(15))))
            .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
            .compact();

    assertThatThrownBy(() -> service.parse(forged)).isInstanceOf(InvalidTokenException.class);
  }
}
