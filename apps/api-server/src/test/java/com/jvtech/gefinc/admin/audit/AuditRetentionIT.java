package com.jvtech.gefinc.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.auth.AccountDeletionService;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.common.security.RequestOrigin;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestClockConfig;
import com.jvtech.gefinc.support.TestUsers;
import java.lang.reflect.Method;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * Retenção e anonimização da trilha (FR-039, FR-062, SC-011, SC-021): excluir a conta apaga em
 * cascata o IP e o dispositivo sem tocar na linha da trilha nem na justificativa, e a rotina diária
 * apaga só o IP e o dispositivo de visitantes com mais de 90 dias. A trilha em si nunca é alterada.
 */
class AuditRetentionIT extends IntegrationTestBase {

  private static final Instant NOW = TestClockConfig.START;
  private static final String IP_ANA = "198.51.100.10";

  @Autowired private AuditService audit;
  @Autowired private AuditClientPurgeJob job;
  @Autowired private AccountDeletionService deletion;
  @Autowired private Pseudonymizer pseudonymizer;
  @MockitoSpyBean private AuditLogClientRepository clients;

  private SeededUser admin;
  private SeededUser ana;

  @BeforeEach
  void init() {
    admin = seed.createAdmin("adm@teste.com");
    ana = seed.createUser("ana@teste.com");
  }

  private static RequestOrigin origin(String ip) {
    return new RequestOrigin(ip, "Firefox em Linux", "WEB");
  }

  /** Grava uma tentativa negada com o relógio da aplicação em {@code at}. */
  private long attemptAt(Instant at, String ip, ActorKind kind, Long actor, Long target) {
    clock.set(at);
    try {
      AuditEntry entry =
          AuditEntry.builder(AuditAction.REVERT_ATTEMPT)
              .actor(kind, actor)
              .target(target)
              .refusal("ACCOUNT_SUSPENDED")
              .build();
      assertThat(audit.recordAttempt(entry, origin(ip), target == null ? null : "t" + target))
          .isTrue();
    } finally {
      clock.set(NOW);
    }
    return jdbc.queryForObject("SELECT max(id) FROM audit_log", Long.class);
  }

  private long clientRows() {
    return jdbc.queryForObject("SELECT count(*) FROM audit_log_client", Long.class);
  }

  private long auditRows() {
    return jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class);
  }

  private String auditSnapshot() {
    return jdbc.queryForObject(
        "SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text, '[]') FROM audit_log a",
        String.class);
  }

  private JsonNode detail(String token, long id) throws Exception {
    return objectMapper.readTree(
        mockMvc
            .perform(get("/admin/audit/" + id).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  private String adminToken() throws Exception {
    return new TestUsers(mockMvc, objectMapper)
        .login(admin.email(), TestUsers.PASSWORD)
        .get("accessToken")
        .asText();
  }

  // ------------------------------------------------------------------ exclusão do usuário

  @Test
  void excluirOUsuarioApagaIpEDispositivoPorCascataEMantemATrilhaEAJustificativa()
      throws Exception {
    long userAttempt = attemptAt(NOW, IP_ANA, ActorKind.USER, ana.id(), ana.id());
    long visitorAttempt = attemptAt(NOW, IP_ANA, ActorKind.VISITOR, null, ana.id());
    long suspension =
        jdbc.queryForObject(
            "INSERT INTO audit_log (occurred_at, action, result, actor_kind, actor_user_id,"
                + " target_user_id, reason_text, details) VALUES (?, 'USER_SUSPENDED', 'SUCCESS',"
                + " 'ADMIN', ?, ?, 'Justificativa preservada', '{}'::jsonb) RETURNING id",
            Long.class,
            Timestamp.from(NOW),
            admin.id(),
            ana.id());
    String token = adminToken();
    JsonNode before = detail(token, userAttempt);
    assertThat(before.get("client").get("ip").asText()).isEqualTo(IP_ANA);
    assertThat(before.get("actor").get("label").asText()).isEqualTo("ana@teste.com");
    String ref = before.get("client").get("ref").asText();
    String snapshot = auditSnapshot();
    assertThat(clientRows()).isEqualTo(2);

    seed.scheduleDeletion(ana.id(), clock.instant());
    clock.advance(Duration.ofDays(30).plusHours(1));
    assertThat(deletion.deleteExpired()).isEqualTo(1);

    // O IP e o dispositivo de quem tinha conta somem por cascata; o do visitante fica.
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log_client WHERE audit_id = ?",
                Long.class,
                userAttempt))
        .isZero();
    assertThat(clientRows()).isEqualTo(1);
    // As 3 linhas anteriores da trilha não mudam um byte.
    String previousRowsSnapshot =
        jdbc.queryForObject(
            "SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text, '[]') FROM (SELECT * FROM audit_log WHERE id <= 3) a",
            String.class);
    assertThat(previousRowsSnapshot).isEqualTo(snapshot);

    // O serviço de erasure registra a ação ACCOUNT_ERASED pelo SYSTEM.
    assertThat(auditRows()).isEqualTo(4);
    Map<String, Object> erasureAudit =
        jdbc.queryForMap(
            "SELECT action, actor_kind, target_user_id, result FROM audit_log WHERE id = 4");
    assertThat(erasureAudit.get("action")).isEqualTo("ACCOUNT_ERASED");
    assertThat(erasureAudit.get("actor_kind")).isEqualTo("SYSTEM");
    assertThat(((Number) erasureAudit.get("target_user_id")).longValue()).isEqualTo(ana.id());
    assertThat(erasureAudit.get("result")).isEqualTo("SUCCESS");

    String freshToken = adminToken();
    String anonymous = pseudonymizer.anonymousLabel(ana.id());
    JsonNode afterAttempt = detail(freshToken, userAttempt);
    assertThat(afterAttempt.get("actor").get("label").asText()).isEqualTo(anonymous);
    assertThat(afterAttempt.get("target").get("label").asText()).isEqualTo(anonymous);
    assertThat(afterAttempt.get("client").get("ref").asText()).isEqualTo(ref);
    assertThat(afterAttempt.get("client").has("ip")).isFalse();
    assertThat(afterAttempt.get("client").has("device")).isFalse();
    // O mesmo IP continua correlacionável com a tentativa de visitante, que ainda tem o IP.
    JsonNode visitor = detail(freshToken, visitorAttempt);
    assertThat(visitor.get("client").get("ref").asText()).isEqualTo(ref);
    assertThat(visitor.get("client").get("ip").asText()).isEqualTo(IP_ANA);
    JsonNode kept = detail(freshToken, suspension);
    assertThat(kept.get("reason").asText()).isEqualTo("Justificativa preservada");
    assertThat(kept.get("target").get("label").asText()).isEqualTo(anonymous);
    assertThat(kept.get("actor").get("label").asText()).isEqualTo("adm@teste.com");
  }

  // ------------------------------------------------------------------ rotina de 90 dias

  @Test
  void rotinaApagaVisitantesComMaisDeNoventaDiasEPreservaOsMaisNovosEOsDeUsuario()
      throws Exception {
    long v89 =
        attemptAt(NOW.minus(Duration.ofDays(89)), "203.0.113.1", ActorKind.VISITOR, null, 1L);
    long justUnder =
        attemptAt(
            NOW.minus(Duration.ofDays(90)).plusSeconds(1),
            "203.0.113.2",
            ActorKind.VISITOR,
            null,
            1L);
    long justOver =
        attemptAt(
            NOW.minus(Duration.ofDays(90)).minusSeconds(1),
            "203.0.113.3",
            ActorKind.VISITOR,
            null,
            1L);
    long v91 =
        attemptAt(NOW.minus(Duration.ofDays(91)), "203.0.113.4", ActorKind.VISITOR, null, 1L);
    long v400 =
        attemptAt(NOW.minus(Duration.ofDays(400)), "203.0.113.5", ActorKind.VISITOR, null, 1L);
    long user400 =
        attemptAt(NOW.minus(Duration.ofDays(400)), IP_ANA, ActorKind.USER, ana.id(), ana.id());
    String snapshot = auditSnapshot();
    String token = adminToken();

    assertThat(job.run()).isEqualTo(3);

    assertThat(jdbc.queryForList("SELECT audit_id FROM audit_log_client", Long.class))
        .containsExactlyInAnyOrder(v89, justUnder, user400);
    assertThat(auditSnapshot()).isEqualTo(snapshot);
    // A linha apagada continua na leitura, só sem o IP; a referência segue correlacionável.
    JsonNode purged = detail(token, v91);
    assertThat(purged.get("client").get("ref").asText()).matches("anônimo-[0-9a-f]{8}");
    assertThat(purged.get("client").has("ip")).isFalse();
    assertThat(detail(token, v400).get("client").has("ip")).isFalse();
    assertThat(detail(token, justOver).get("client").has("ip")).isFalse();
    assertThat(detail(token, v89).get("client").get("ip").asText()).isEqualTo("203.0.113.1");
    assertThat(detail(token, user400).get("client").get("ip").asText()).isEqualTo(IP_ANA);
  }

  @Test
  void rotinaEIdempotenteERecuperaOAtrasoNaExecucaoSeguinte() throws Exception {
    attemptAt(NOW.minus(Duration.ofDays(91)), "203.0.113.1", ActorKind.VISITOR, null, 1L);
    attemptAt(NOW.minus(Duration.ofDays(89)), "203.0.113.2", ActorKind.VISITOR, null, 1L);
    attemptAt(NOW.minus(Duration.ofDays(500)), IP_ANA, ActorKind.USER, ana.id(), ana.id());

    assertThat(job.run()).isEqualTo(1);
    assertThat(job.run()).isZero();
    assertThat(clientRows()).isEqualTo(2);

    // Dois dias depois (a rotina ficou parada): a seguinte alcança o que passou do prazo.
    clock.advance(Duration.ofDays(2));
    assertThat(job.run()).isEqualTo(1);
    assertThat(job.run()).isZero();
    assertThat(clientRows()).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log_client WHERE user_id = ?", Long.class, ana.id()))
        .isEqualTo(1);
    assertThat(auditRows()).isEqualTo(3);
  }

  private void insertOldVisitorRows(int count) {
    jdbc.update(
        "INSERT INTO audit_log (occurred_at, action, result, actor_kind, details, client_ref)"
            + " SELECT TIMESTAMPTZ '2025-01-01 00:00:00+00' + g * interval '1 second',"
            + " 'ACCESS_DENIED', 'REFUSED', 'VISITOR', '{}'::jsonb, 'ref'"
            + " FROM generate_series(1, "
            + count
            + ") g");
    jdbc.update(
        "INSERT INTO audit_log_client (audit_id, user_id, ip, created_at)"
            + " SELECT id, NULL, '203.0.113.9', occurred_at FROM audit_log");
  }

  @Test
  void apagaEmLotesDe5000() {
    insertOldVisitorRows(12000);
    String snapshot = auditSnapshot();

    assertThat(job.run()).isEqualTo(12000);

    verify(clients, times(3)).deleteVisitorBatchBefore(any(Instant.class), eq(5000));
    assertThat(clientRows()).isZero();
    assertThat(auditSnapshot()).isEqualTo(snapshot);
    assertThat(auditRows()).isEqualTo(12000);
  }

  @Test
  void falhaNoMeioDeixaOQueJaFoiApagadoEAProximaExecucaoContinua() {
    insertOldVisitorRows(12000);
    doCallRealMethod()
        .doThrow(new IllegalStateException("falha simulada"))
        .doCallRealMethod()
        .when(clients)
        .deleteVisitorBatchBefore(any(Instant.class), anyInt());

    assertThatThrownBy(job::run).isInstanceOf(IllegalStateException.class);
    assertThat(clientRows()).isEqualTo(7000);

    assertThat(job.run()).isEqualTo(7000);
    assertThat(clientRows()).isZero();
    assertThat(auditRows()).isEqualTo(12000);
  }

  // ------------------------------------------------------------------ agendamento

  @Test
  void agendaDiariamenteAs0415DeSaoPauloENaoTemRotaQueADispare() throws NoSuchMethodException {
    Method run = AuditClientPurgeJob.class.getMethod("run");
    Scheduled scheduled = run.getAnnotation(Scheduled.class);

    assertThat(scheduled.cron()).isEqualTo("0 15 4 * * *");
    assertThat(scheduled.zone()).isEqualTo("America/Sao_Paulo");
    assertThat(AuditClientPurgeJob.RETENTION).isEqualTo(Duration.ofDays(90));
    assertThat(AuditClientPurgeJob.class.getAnnotations())
        .noneMatch(a -> a.annotationType().getSimpleName().endsWith("Controller"));
  }
}
