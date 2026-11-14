package com.jvtech.gefinc.admin.user;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static com.jvtech.gefinc.support.ContractAssertions.responseMatchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.admin.audit.AuditLog;
import com.jvtech.gefinc.admin.audit.AuditLogRepository;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestClockConfig;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.ResultActions;

/**
 * {@code GET /admin/users/{id}}: abrir o detalhe grava {@code USER_DETAIL_OPENED} na mesma
 * transação da leitura (se a trilha falha, nada é devolvido); a lista e a busca não gravam; o
 * detalhe traz sessões abertas, bloqueio de login, exclusão pendente e as últimas 20 ações, e nunca
 * dado financeiro nem IP (FR-060).
 */
class UserDetailAuditIT extends IntegrationTestBase {

  private static final Instant NOW = TestClockConfig.START;

  @MockitoSpyBean private AuditLogRepository auditRepository;

  private TestUser admin;
  private SeededUser adminRow;

  @BeforeEach
  void init() throws Exception {
    adminRow = seed.createAdmin("adm@example.com");
    admin = login("adm@example.com");
  }

  private TestUser login(String email) throws Exception {
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    return new TestUser(
        0, email, users.login(email, TestUsers.PASSWORD).get("accessToken").asText());
  }

  private ResultActions detail(TestUser actor, long id) throws Exception {
    return mockMvc.perform(
        get("/admin/users/" + id).header(HttpHeaders.AUTHORIZATION, actor.bearer()));
  }

  private JsonNode open(long id) throws Exception {
    ResultActions result =
        detail(admin, id).andExpect(status().isOk()).andExpect(matchesContract());
    return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
  }

  private long auditCount() {
    return jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class);
  }

  private long openedCount(long targetId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_log WHERE action = 'USER_DETAIL_OPENED' AND target_user_id = ?",
        Long.class,
        targetId);
  }

  private void insertAudit(
      String action,
      String result,
      String actorKind,
      Long actorId,
      Long targetId,
      Instant at,
      String details) {
    jdbc.update(
        "INSERT INTO audit_log (occurred_at, action, result, actor_kind, actor_user_id,"
            + " target_user_id, details) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)",
        Timestamp.from(at),
        action,
        result,
        actorKind,
        actorId,
        targetId,
        details);
  }

  // ------------------------------------------------------------------ auditoria da abertura

  @Test
  void abrirODetalheGravaUmaLinhaERecarregarGravaOutra() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");

    open(target.id());

    assertThat(auditCount()).isEqualTo(1);
    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM audit_log");
    assertThat(row)
        .containsEntry("action", "USER_DETAIL_OPENED")
        .containsEntry("result", "SUCCESS")
        .containsEntry("actor_kind", "ADMIN")
        .containsEntry("actor_user_id", adminRow.id())
        .containsEntry("target_user_id", target.id());
    assertThat(row.get("reason_text")).isNull();
    assertThat(String.valueOf(row.get("details"))).isEqualTo("{}");

    open(target.id());

    assertThat(openedCount(target.id())).isEqualTo(2);
  }

  @Test
  void listaEBuscaNaoGravamAuditoria() throws Exception {
    seed.createUser("alvo@example.com");

    mockMvc
        .perform(get("/admin/users").header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isOk());
    mockMvc
        .perform(
            get("/admin/users")
                .param("q", "alvo")
                .param("status", "ACTIVE")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isOk());

    assertThat(auditCount()).isZero();
  }

  @Test
  void idInexistenteDa404EAudidaARecusaSemAlvo() throws Exception {
    detail(admin, 999_999L)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"))
        .andExpect(responseMatchesContract());

    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM audit_log");
    assertThat(row)
        .containsEntry("action", "USER_DETAIL_OPENED")
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "NOT_FOUND")
        .containsEntry("actor_user_id", adminRow.id());
    assertThat(row.get("target_user_id")).isNull();
  }

  @Test
  void usuarioComumRecebe403SemAuditarAAbertura() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");
    seed.createUser("comum@example.com");
    TestUser common = login("comum@example.com");

    detail(common, target.id()).andExpect(status().isForbidden());

    assertThat(openedCount(target.id())).isZero();
  }

  @Test
  void falhaNaAuditoriaDesfazALeituraEDa500SemVazarDados() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");
    doThrow(new IllegalStateException("trilha indisponível para alvo@example.com"))
        .when(auditRepository)
        .save(any(AuditLog.class));

    ResultActions result =
        detail(admin, target.id())
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));

    String body = result.andReturn().getResponse().getContentAsString();
    assertThat(body).doesNotContain("alvo@example.com");
    assertThat(auditCount()).isZero();
  }

  // ------------------------------------------------------------------ campos do detalhe

  @Test
  void detalheTrazDadosDaContaSemSessoesBloqueioNemExclusao() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");
    seed.setName(target.id(), "Alvo da Silva");
    seed.setDates(target.id(), NOW.minus(Duration.ofDays(10)), NOW.minus(Duration.ofHours(3)));

    JsonNode body = open(target.id());

    assertThat(body.get("id").asLong()).isEqualTo(target.id());
    assertThat(body.get("email").asText()).isEqualTo("alvo@example.com");
    assertThat(body.get("name").asText()).isEqualTo("Alvo da Silva");
    assertThat(Instant.parse(body.get("createdAt").asText()))
        .isEqualTo(NOW.minus(Duration.ofDays(10)));
    assertThat(Instant.parse(body.get("lastAccessAt").asText()))
        .isEqualTo(NOW.minus(Duration.ofHours(3)));
    assertThat(body.get("role").asText()).isEqualTo("USER");
    assertThat(body.get("suspended").asBoolean()).isFalse();
    assertThat(body.get("deletionPending").asBoolean()).isFalse();
    assertThat(body.get("protected").asBoolean()).isFalse();
    assertThat(body.get("openSessions").asInt()).isZero();
    assertThat(body.has("loginLock")).isFalse();
    assertThat(body.has("deletion")).isFalse();
    assertThat(body.has("pendingEmailChange")).isFalse();
    assertThat(body.get("recentActions")).isEmpty();
  }

  @Test
  void detalheDoRaizEProtegido() throws Exception {
    SeededUser root = seed.createRoot("raiz@example.com");

    JsonNode body = open(root.id());

    assertThat(body.get("role").asText()).isEqualTo("ROOT");
    assertThat(body.get("protected").asBoolean()).isTrue();
  }

  @Test
  void contaSessoesAbertasIgnorandoRevogadasEExpiradas() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");
    insertSession(target.id(), NOW.plus(Duration.ofDays(1)), null);
    insertSession(target.id(), NOW.plus(Duration.ofDays(2)), null);
    insertSession(target.id(), NOW.plus(Duration.ofDays(2)), NOW.minus(Duration.ofHours(1)));
    insertSession(target.id(), NOW.minus(Duration.ofMinutes(1)), null);
    SeededUser other = seed.createUser("outro@example.com");
    insertSession(other.id(), NOW.plus(Duration.ofDays(1)), null);

    assertThat(open(target.id()).get("openSessions").asInt()).isEqualTo(2);
  }

  private void insertSession(long userId, Instant expiresAt, Instant revokedAt) {
    jdbc.update(
        "INSERT INTO auth_sessions (id, user_id, created_at, last_used_at, expires_at, client_kind,"
            + " revoked_at, revoked_by) VALUES (?, ?, ?, ?, ?, 'WEB', ?, ?)",
        UUID.randomUUID(),
        userId,
        Timestamp.from(NOW.minus(Duration.ofDays(1))),
        Timestamp.from(NOW.minus(Duration.ofHours(1))),
        Timestamp.from(expiresAt),
        revokedAt == null ? null : Timestamp.from(revokedAt),
        revokedAt == null ? null : "ADMIN");
  }

  @Test
  void mostraOBloqueioDeLoginAteQuando() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");
    for (int i = 0; i < 5; i++) {
      failedLogin("alvo@example.com");
    }

    JsonNode body = open(target.id());

    assertThat(Instant.parse(body.get("loginLock").get("lockedUntil").asText()))
        .isEqualTo(NOW.plus(Duration.ofMinutes(15)));

    clock.advance(Duration.ofMinutes(16));
    admin = login("adm@example.com");
    assertThat(open(target.id()).has("loginLock")).isFalse();
  }

  @Test
  void quatroFalhasAindaNaoBloqueiam() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");
    for (int i = 0; i < 4; i++) {
      failedLogin("alvo@example.com");
    }

    assertThat(open(target.id()).has("loginLock")).isFalse();
  }

  private void failedLogin(String email) throws Exception {
    String json = objectMapper.writeValueAsString(Map.of("email", email, "password", "errada-123"));
    mockMvc
        .perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content(json))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void mostraAExclusaoPendenteSemJustificativa() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");
    seed.scheduleDeletion(target.id(), NOW.minus(Duration.ofDays(2)));

    JsonNode body = open(target.id());

    assertThat(body.get("deletionPending").asBoolean()).isTrue();
    JsonNode deletion = body.get("deletion");
    assertThat(deletion.get("origin").asText()).isEqualTo("USER");
    assertThat(Instant.parse(deletion.get("requestedAt").asText()))
        .isEqualTo(NOW.minus(Duration.ofDays(2)));
    assertThat(Instant.parse(deletion.get("dueAt").asText()))
        .isEqualTo(NOW.minus(Duration.ofDays(2)).plus(Duration.ofDays(30)));
    assertThat(deletion.fieldNames())
        .toIterable()
        .doesNotContain("justification", "reason", "reasonText", "reasonMessage");
  }

  @Test
  void suspensaoApareceNaSituacao() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");
    seed.suspend(target.id(), NOW.minus(Duration.ofDays(1)));

    assertThat(open(target.id()).get("suspended").asBoolean()).isTrue();
  }

  // ------------------------------------------------------------------ últimas ações

  @Test
  void mostraNoMaximoAsUltimas20AcoesDaMaisRecenteParaAMaisAntiga() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");
    for (int i = 1; i <= 25; i++) {
      insertAudit(
          "USER_RENAMED",
          "SUCCESS",
          "ADMIN",
          adminRow.id(),
          target.id(),
          NOW.minus(Duration.ofHours(30 - i)),
          "{}");
    }
    // Ações sobre outro usuário não entram.
    SeededUser other = seed.createUser("outro@example.com");
    insertAudit("USER_RENAMED", "SUCCESS", "ADMIN", adminRow.id(), other.id(), NOW, "{}");

    JsonNode actions = open(target.id()).get("recentActions");

    assertThat(actions).hasSize(20);
    List<Instant> times = new ArrayList<>();
    actions.forEach(a -> times.add(Instant.parse(a.get("occurredAt").asText())));
    assertThat(times).isSortedAccordingTo(java.util.Comparator.reverseOrder());
    assertThat(times.get(0)).isEqualTo(NOW.minus(Duration.ofHours(5)));
  }

  @Test
  void aAberturaAparecePorUltimoNaProximaConsulta() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");

    assertThat(open(target.id()).get("recentActions")).isEmpty();
    clock.advance(Duration.ofMinutes(1));
    JsonNode second = open(target.id());

    assertThat(second.get("recentActions")).hasSize(1);
    JsonNode entry = second.get("recentActions").get(0);
    assertThat(entry.get("action").asText()).isEqualTo("USER_DETAIL_OPENED");
    assertThat(entry.get("result").asText()).isEqualTo("SUCCESS");
    assertThat(entry.get("summary").asText()).isEqualTo("Detalhe do usuário aberto");
  }

  @Test
  void entradasTrazemAtorAlvoResumoEJustificativaSemIp() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");
    seed.setName(adminRow.id(), "Ana Admin");
    insertAudit(
        "ROLE_GRANTED",
        "SUCCESS",
        "ADMIN",
        adminRow.id(),
        target.id(),
        NOW.minus(Duration.ofHours(5)),
        "{\"from\": \"USER\", \"to\": \"ADMIN\"}");
    jdbc.update(
        "INSERT INTO audit_log (occurred_at, action, result, actor_kind, actor_user_id,"
            + " target_user_id, refusal_code, reason_text) VALUES (?, 'ROLE_GRANTED', 'REFUSED',"
            + " 'ADMIN', ?, ?, 'ROOT_PROTECTED', 'Pedido do suporte')",
        Timestamp.from(NOW.minus(Duration.ofHours(4))),
        adminRow.id(),
        target.id());
    insertAudit(
        "USER_SUSPENDED",
        "SUCCESS",
        "ADMIN",
        987_654L,
        target.id(),
        NOW.minus(Duration.ofHours(3)),
        "{}");
    insertAudit(
        "SESSIONS_REVOKED_ALL",
        "SUCCESS",
        "SYSTEM",
        null,
        target.id(),
        NOW.minus(Duration.ofHours(2)),
        "{}");
    insertAudit(
        "PASSWORD_RESET_SENT",
        "FAILED",
        "VISITOR",
        null,
        target.id(),
        NOW.minus(Duration.ofHours(1)),
        "{}");

    JsonNode actions = open(target.id()).get("recentActions");

    assertThat(actions).hasSize(5);
    JsonNode visitor = actions.get(0);
    assertThat(visitor.get("actor").get("label").asText()).isEqualTo("visitante");
    assertThat(visitor.get("actor").has("userId")).isFalse();
    assertThat(visitor.get("summary").asText())
        .isEqualTo("Falha ao enviar o e-mail de redefinição de senha");
    JsonNode system = actions.get(1);
    assertThat(system.get("actor").get("label").asText()).isEqualTo("sistema");
    JsonNode erasedActor = actions.get(2);
    assertThat(erasedActor.get("actor").get("userId").asLong()).isEqualTo(987_654L);
    assertThat(erasedActor.get("actor").get("label").asText()).matches("^anônimo-[0-9a-f]{8}$");
    JsonNode refused = actions.get(3);
    assertThat(refused.get("result").asText()).isEqualTo("REFUSED");
    assertThat(refused.get("refusalCode").asText()).isEqualTo("ROOT_PROTECTED");
    assertThat(refused.get("reason").asText()).isEqualTo("Pedido do suporte");
    assertThat(refused.get("summary").asText())
        .isEqualTo("Tentativa recusada de conceder o perfil de administrador");
    JsonNode granted = actions.get(4);
    assertThat(granted.get("actor").get("userId").asLong()).isEqualTo(adminRow.id());
    assertThat(granted.get("actor").get("label").asText()).isEqualTo("Ana Admin");
    assertThat(granted.get("target").get("userId").asLong()).isEqualTo(target.id());
    assertThat(granted.get("target").get("label").asText()).isEqualTo("alvo@example.com");
    assertThat(granted.get("summary").asText()).isEqualTo("Perfil de administrador concedido");
    assertThat(granted.get("details").get("from").asText()).isEqualTo("USER");
    assertThat(granted.get("details").get("to").asText()).isEqualTo("ADMIN");
    assertThat(granted.has("reason")).isFalse();
    assertThat(actions.toString()).doesNotContain("\"ip\"").doesNotContain("device");
  }

  // ------------------------------------------------------------------ sem dado financeiro

  @Test
  void nenhumCampoDoDetalheEFinanceiroOuSensivel() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");
    insertSession(target.id(), NOW.plus(Duration.ofDays(1)), null);
    seed.scheduleDeletion(target.id(), NOW);
    insertAudit("USER_RENAMED", "SUCCESS", "ADMIN", adminRow.id(), target.id(), NOW, "{}");

    JsonNode body = open(target.id());

    Set<String> names = new java.util.TreeSet<>();
    collectFieldNames(body, names);
    assertThat(names)
        .doesNotContain(
            "ip",
            "clientIp",
            "device",
            "passwordHash",
            "password",
            "tokenVersion",
            "accounts",
            "cards",
            "categories",
            "transactions",
            "transfers",
            "balance",
            "amount");
  }

  private static void collectFieldNames(JsonNode node, Set<String> names) {
    node.fieldNames().forEachRemaining(names::add);
    node.forEach(child -> collectFieldNames(child, names));
  }
}
