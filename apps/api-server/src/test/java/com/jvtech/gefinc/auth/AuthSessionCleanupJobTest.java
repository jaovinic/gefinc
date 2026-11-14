package com.jvtech.gefinc.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * A rotina diária remove as sessões expiradas ou encerradas há mais de 30 dias e não toca nas
 * abertas, nas recentes nem nos tokens de renovação.
 */
class AuthSessionCleanupJobTest extends IntegrationTestBase {

  private static final Duration RETENTION = Duration.ofDays(30);

  @Autowired private AuthSessionCleanupJob job;

  private SeededUser user;
  private Instant now;

  @BeforeEach
  void init() {
    user = seed.createUser("ana@teste.com");
    now = clock.instant();
  }

  private UUID session(Instant expiresAt, Instant revokedAt) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO auth_sessions (id, user_id, created_at, last_used_at, expires_at,"
            + " client_kind, revoked_at, revoked_by) VALUES (?, ?, ?, ?, ?, 'WEB', ?, ?)",
        id,
        user.id(),
        Timestamp.from(now.minus(Duration.ofDays(90))),
        Timestamp.from(now.minus(Duration.ofDays(90))),
        Timestamp.from(expiresAt),
        revokedAt == null ? null : Timestamp.from(revokedAt),
        revokedAt == null ? null : "USER");
    return id;
  }

  private List<UUID> remaining() {
    return jdbc.queryForList("SELECT id FROM auth_sessions", UUID.class);
  }

  @Test
  void removeExpiradasERevogadasHaMaisDeTrintaDiasEPoupaAsDemais() {
    UUID expiredLongAgo = session(now.minus(RETENTION).minusSeconds(1), null);
    UUID revokedLongAgo =
        session(now.plus(Duration.ofDays(10)), now.minus(RETENTION).minusSeconds(1));
    UUID expiredRecently = session(now.minus(Duration.ofDays(29)), null);
    UUID revokedRecently = session(now.plus(Duration.ofDays(10)), now.minus(Duration.ofDays(29)));
    UUID open = session(now.plus(Duration.ofDays(10)), null);
    UUID expiredExactlyThirtyDays = session(now.minus(RETENTION), null);

    job.run();

    assertThat(remaining())
        .containsExactlyInAnyOrder(expiredRecently, revokedRecently, open, expiredExactlyThirtyDays)
        .doesNotContain(expiredLongAgo, revokedLongAgo);
  }

  @Test
  void naoTocaNosTokensDeRenovacaoNemNasSessoesAbertas() {
    UUID open = session(now.plus(Duration.ofDays(10)), null);
    UUID gone = session(now.minus(Duration.ofDays(40)), null);
    jdbc.update(
        "INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, created_at)"
            + " VALUES (?, ?, 'hash-aberta', ?, ?), (?, ?, 'hash-antiga', ?, ?)",
        user.id(),
        open,
        Timestamp.from(now.plus(Duration.ofDays(10))),
        Timestamp.from(now),
        user.id(),
        gone,
        Timestamp.from(now.minus(Duration.ofDays(40))),
        Timestamp.from(now.minus(Duration.ofDays(70))));

    job.run();

    assertThat(remaining()).containsExactly(open);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens", Long.class)).isEqualTo(2);
  }

  @Test
  void acompanhaORelogioEPodeRodarVariasVezes() {
    UUID soon = session(now.plus(Duration.ofDays(5)), null);

    job.run();
    assertThat(remaining()).containsExactly(soon);

    clock.advance(Duration.ofDays(36));
    job.run();
    assertThat(remaining()).isEmpty();

    job.run();
    assertThat(remaining()).isEmpty();
  }
}
