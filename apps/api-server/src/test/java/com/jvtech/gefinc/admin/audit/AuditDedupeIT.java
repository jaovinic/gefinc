package com.jvtech.gefinc.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.common.security.RequestOrigin;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Deduplicação das tentativas negadas: a mesma tentativa (ator, IP, alvo da decisão e tipo) dentro
 * de 15 minutos gera uma só linha e só incrementa o contador.
 */
class AuditDedupeIT extends IntegrationTestBase {

  private static final String SUPPRESSED = "gefinc.admin.attempts.suppressed";
  private static final RequestOrigin IP_A =
      new RequestOrigin("203.0.113.7", "Chrome em Windows", "WEB");
  private static final RequestOrigin IP_B =
      new RequestOrigin("203.0.113.8", "Chrome em Windows", "WEB");

  @Autowired private AuditService audit;
  @Autowired private PlatformTransactionManager transactionManager;

  private AuditEntry denied(AuditAction action, Long actor) {
    return AuditEntry.builder(action)
        .actor(actor == null ? ActorKind.VISITOR : ActorKind.ADMIN, actor)
        .refusal("REAUTH_FAILED")
        .build();
  }

  private long count() {
    return jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class);
  }

  @Test
  void cincoTentativasIguaisEmQuinzeMinutosGeramUmaLinhaEQuatroSuprimidas() {
    SeededUser admin = seed.createAdmin("adm@example.com");
    double before = counter(SUPPRESSED, "type", "ACCESS_DENIED");

    for (int i = 0; i < 5; i++) {
      boolean recorded =
          audit.recordAttempt(denied(AuditAction.ACCESS_DENIED, admin.id()), IP_A, "5");
      assertThat(recorded).isEqualTo(i == 0);
      clock.advance(Duration.ofMinutes(2));
    }

    assertThat(count()).isEqualTo(1);
    assertThat(counter(SUPPRESSED, "type", "ACCESS_DENIED") - before).isEqualTo(4.0);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log_client", Long.class))
        .isEqualTo(1);
  }

  @Test
  void apos15MinutosDaPrimeiraNovaLinhaEntraEJustoAntesAindaDeduplica() {
    SeededUser admin = seed.createAdmin("adm@example.com");
    assertThat(audit.recordAttempt(denied(AuditAction.ACCESS_DENIED, admin.id()), IP_A, "5"))
        .isTrue();

    clock.advance(Duration.ofMinutes(15).minusSeconds(1));
    assertThat(audit.recordAttempt(denied(AuditAction.ACCESS_DENIED, admin.id()), IP_A, "5"))
        .isFalse();

    clock.advance(Duration.ofSeconds(1));
    assertThat(audit.recordAttempt(denied(AuditAction.ACCESS_DENIED, admin.id()), IP_A, "5"))
        .isTrue();
    assertThat(count()).isEqualTo(2);
  }

  @Test
  void atorIpAlvoOuTipoDiferentesNaoDeduplicam() {
    SeededUser admin = seed.createAdmin("adm@example.com");
    SeededUser other = seed.createAdmin("outro@example.com");

    assertThat(audit.recordAttempt(denied(AuditAction.ACCESS_DENIED, admin.id()), IP_A, "5"))
        .isTrue();
    assertThat(audit.recordAttempt(denied(AuditAction.ACCESS_DENIED, other.id()), IP_A, "5"))
        .isTrue();
    assertThat(audit.recordAttempt(denied(AuditAction.ACCESS_DENIED, admin.id()), IP_B, "5"))
        .isTrue();
    assertThat(audit.recordAttempt(denied(AuditAction.ACCESS_DENIED, admin.id()), IP_A, "6"))
        .isTrue();
    assertThat(audit.recordAttempt(denied(AuditAction.REVERT_ATTEMPT, admin.id()), IP_A, "5"))
        .isTrue();

    assertThat(count()).isEqualTo(5);
    assertThat(audit.recordAttempt(denied(AuditAction.ACCESS_DENIED, admin.id()), IP_A, "5"))
        .isFalse();
  }

  @Test
  void visitanteUsaOIpComoAtorESemUsuarioNaTabelaDePessoais() {
    assertThat(audit.recordAttempt(denied(AuditAction.REVERT_ATTEMPT, null), IP_A, "7")).isTrue();
    assertThat(audit.recordAttempt(denied(AuditAction.REVERT_ATTEMPT, null), IP_A, "7")).isFalse();
    assertThat(audit.recordAttempt(denied(AuditAction.REVERT_ATTEMPT, null), IP_B, "7")).isTrue();

    assertThat(count()).isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE actor_kind = 'VISITOR' AND actor_user_id IS NULL",
                Long.class))
        .isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log_client WHERE user_id IS NULL", Long.class))
        .isEqualTo(2);
  }

  @Test
  void semOrigemConhecidaGravaATrilhaSemLinhaDePessoais() {
    SeededUser admin = seed.createAdmin("adm@example.com");

    audit.recordAttempt(denied(AuditAction.ACCESS_DENIED, admin.id()), RequestOrigin.NONE, "5");

    assertThat(count()).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log_client", Long.class)).isZero();
  }

  @Test
  void consultaDeDeduplicacaoUsaOIndiceParcial() {
    String plan =
        new TransactionTemplate(transactionManager)
            .execute(
                status -> {
                  jdbc.execute("SET LOCAL enable_seqscan = off");
                  List<String> lines =
                      jdbc.queryForList(
                          "EXPLAIN SELECT 1 FROM audit_log WHERE dedupe_key = 'abc' AND occurred_at"
                              + " > now() - interval '15 minutes'",
                          String.class);
                  return String.join("\n", lines);
                });

    assertThat(plan).contains("ix_al_dedupe");
  }
}
