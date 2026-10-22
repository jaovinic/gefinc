package com.jvtech.gefinc.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jvtech.gefinc.support.MutableClock;
import java.time.Duration;
import java.time.Instant;
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
}
