package com.jvtech.gefinc.admin.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Testes da rotina de expiração de convites de cadastro em lote (US9, T128). */
class InvitationExpiryJobTest extends IntegrationTestBase {

  @Autowired private InvitationExpiryJob job;
  @Autowired private Pseudonymizer pseudonymizer;

  private SeededUser admin;
  private Instant now;

  @BeforeEach
  void init() {
    admin = seed.createAdmin("adm-job@example.com");
    now = clock.instant();
  }

  private long insertInvitation(String email, String tokenHash, String status, Instant expiresAt) {
    String emailRef = pseudonymizer.emailRef(email);
    return jdbc.queryForObject(
        "INSERT INTO invitations (email, email_ref, token_hash, status, expires_at, invited_by, created_at)"
            + " VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
        Long.class,
        "PENDING".equals(status) ? email : null,
        emailRef,
        tokenHash,
        status,
        Timestamp.from(expiresAt),
        admin.id(),
        Timestamp.from(now.minus(Duration.ofDays(10))));
  }

  @Test
  void convitesVencidosViramExpiredEZeramEmailEmClaro() {
    long expiredId = insertInvitation("vencido@teste.com", "hash1", "PENDING", now.minusSeconds(1));
    long validId =
        insertInvitation("valido@teste.com", "hash2", "PENDING", now.plus(Duration.ofDays(2)));

    int expiredCount = job.run();
    assertThat(expiredCount).isEqualTo(1);

    // Vencido virou EXPIRED e zerou e-mail
    Map<String, Object> expiredRow =
        jdbc.queryForMap("SELECT * FROM invitations WHERE id = ?", expiredId);
    assertThat(expiredRow.get("status")).isEqualTo("EXPIRED");
    assertThat(expiredRow.get("email")).isNull();
    assertThat(expiredRow.get("resolved_at")).isNotNull();

    // Válido continua PENDING com e-mail preservado
    Map<String, Object> validRow =
        jdbc.queryForMap("SELECT * FROM invitations WHERE id = ?", validId);
    assertThat(validRow.get("status")).isEqualTo("PENDING");
    assertThat(validRow.get("email")).isEqualTo("valido@teste.com");
    assertThat(validRow.get("resolved_at")).isNull();
  }

  @Test
  void avancoDoRelogioExpiraDemaisConvites() {
    long id =
        insertInvitation(
            "futuro@teste.com", "hash-futuro", "PENDING", now.plus(Duration.ofDays(3)));

    job.run();
    assertThat(jdbc.queryForObject("SELECT status FROM invitations WHERE id = ?", String.class, id))
        .isEqualTo("PENDING");

    clock.advance(Duration.ofDays(4));
    int count = job.run();
    assertThat(count).isEqualTo(1);

    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM invitations WHERE id = ?", id);
    assertThat(row.get("status")).isEqualTo("EXPIRED");
    assertThat(row.get("email")).isNull();
  }
}
