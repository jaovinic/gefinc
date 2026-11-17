package com.jvtech.gefinc.admin.email;

import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.support.IntegrationTestBase;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * {@link EmailDeliveryPurgeJob} (T110, US7): lotes, idempotência e escopo restrito ao histórico.
 */
class EmailDeliveryPurgeJobTest extends IntegrationTestBase {

  @Autowired private EmailDeliveryPurgeJob job;

  private void insertAt(Instant at, int count) {
    jdbc.update(
        "INSERT INTO email_deliveries (created_at, kind, recipient_email, recipient_ref, status)"
            + " SELECT ?, 'TEST', 'a@teste.com', 'ref', 'SENT' FROM generate_series(1, ?)",
        java.sql.Timestamp.from(at),
        count);
  }

  private long count() {
    return jdbc.queryForObject("SELECT count(*) FROM email_deliveries", Long.class);
  }

  @Test
  void apagaOsComMaisDe90DiasEMantemOsDemais() {
    Instant now = clock.instant();
    insertAt(now.minus(Duration.ofDays(91)), 3);
    insertAt(now.minus(Duration.ofDays(89)), 2);

    assertThat(job.run()).isEqualTo(3);
    assertThat(count()).isEqualTo(2);
    assertThat(job.run()).isZero();
  }

  @Test
  void apagaMaisDeUmLoteEmLotes() {
    insertAt(clock.instant().minus(Duration.ofDays(120)), EmailDeliveryPurgeJob.BATCH_SIZE + 7);

    assertThat(job.run()).isEqualTo(EmailDeliveryPurgeJob.BATCH_SIZE + 7);
    assertThat(count()).isZero();
  }

  @Test
  void naoTocaEmPendingCommunications() {
    long before = jdbc.queryForObject("SELECT count(*) FROM pending_communications", Long.class);
    insertAt(clock.instant().minus(Duration.ofDays(120)), 1);

    job.run();

    assertThat(jdbc.queryForObject("SELECT count(*) FROM pending_communications", Long.class))
        .isEqualTo(before);
  }
}
