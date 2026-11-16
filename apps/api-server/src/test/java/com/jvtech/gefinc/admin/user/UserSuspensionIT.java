package com.jvtech.gefinc.admin.user;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static com.jvtech.gefinc.support.ContractAssertions.responseMatchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.auth.TokenService;
import com.jvtech.gefinc.support.AdminClient;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Suspender e reativar (US3): motivo de 1 a 500 caracteres guardado só na auditoria, sessão antiga
 * recusada na requisição seguinte, login recusado com {@code 403 ACCOUNT_SUSPENDED} só depois de
 * credenciais corretas (sem enumerar contas), reativação que mantém a exclusão pendente,
 * redefinição de senha que não reativa e as recusas de regra (si mesmo e raiz). O "último
 * administrador" é serializado pela trava consultiva e só se alcança em corrida: ver {@code
 * SuspensionConcurrencyIT}.
 */
class UserSuspensionIT extends IntegrationTestBase {

  private static final String REASON = "Uso indevido da plataforma, conforme chamado 4471";

  private AdminClient api;
  private TestUser admin;
  private SeededUser adminRow;

  @BeforeEach
  void init() throws Exception {
    api = new AdminClient(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm@teste.com");
    admin = api.login(adminRow.id(), "adm@teste.com");
  }

  private Map<String, Object> audit(String action) {
    return jdbc.queryForMap(
        "SELECT * FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT 1", action);
  }

  private long auditCount(String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_log WHERE action = ?", Long.class, action);
  }

  private boolean suspended(long id) {
    return jdbc.queryForObject(
        "SELECT suspended_at IS NOT NULL FROM users WHERE id = ?", Boolean.class, id);
  }

  private int tokenVersion(long id) {
    return jdbc.queryForObject("SELECT token_version FROM users WHERE id = ?", Integer.class, id);
  }

  // ------------------------------------------------------------------ motivo

  @Test
  void suspenderExigeMotivoDe1a500Caracteres() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");

    for (String invalid : new String[] {"{}", "{\"reason\":\"\"}", "{\"reason\":\"   \"}"}) {
      api.suspendRaw(admin, target.id(), invalid)
          .andExpect(status().isUnprocessableEntity())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
          .andExpect(jsonPath("$.errors[0].field").value("reason"))
          .andExpect(responseMatchesContract());
    }
    api.suspend(admin, target.id(), "x".repeat(501))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[0].field").value("reason"))
        .andExpect(responseMatchesContract());
    assertThat(suspended(target.id())).isFalse();

    api.suspend(admin, target.id(), "x".repeat(500))
        .andExpect(status().isNoContent())
        .andExpect(matchesContract());

    assertThat(suspended(target.id())).isTrue();
    // 4 recusas de validação auditadas e 1 sucesso, todas com o mesmo alvo
    assertThat(auditCount("USER_SUSPENDED")).isEqualTo(5);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'USER_SUSPENDED'"
                    + " AND result = 'REFUSED' AND refusal_code = 'VALIDATION_ERROR'",
                Long.class))
        .isEqualTo(4);
  }

  @Test
  void motivoComCaractereNulDa422SemSuspenderERegistraARecusaSemOTexto() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");
    double failedBefore = counter("gefinc.admin.audit.refusal_failed");

    api.suspendRaw(admin, target.id(), "{\"reason\":\"ab\\u0000cd\"}")
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
        .andExpect(jsonPath("$.errors[0].field").value("reason"))
        .andExpect(responseMatchesContract());

    assertThat(suspended(target.id())).isFalse();
    Map<String, Object> row = audit("USER_SUSPENDED");
    assertThat(row)
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "VALIDATION_ERROR")
        .containsEntry("target_user_id", target.id());
    assertThat(row.get("reason_text")).isNull();
    assertThat(auditCount("USER_SUSPENDED")).isEqualTo(1);
    assertThat(counter("gefinc.admin.audit.refusal_failed") - failedBefore).isZero();
  }

  @Test
  void motivoFicaSoNaAuditoriaComAtorEAlvo() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");

    api.suspend(admin, target.id(), REASON).andExpect(status().isNoContent());

    Map<String, Object> row = audit("USER_SUSPENDED");
    assertThat(row)
        .containsEntry("result", "SUCCESS")
        .containsEntry("actor_kind", "ADMIN")
        .containsEntry("actor_user_id", adminRow.id())
        .containsEntry("target_user_id", target.id())
        .containsEntry("reason_text", REASON);
    assertThat(String.valueOf(row.get("details"))).isEqualTo("{}");
    assertThat(String.valueOf(row.get("details"))).doesNotContain(REASON);
    assertThat(row.get("subject")).isNull();
  }

  // ------------------------------------------------------------------ efeito

  @Test
  void sessaoAntigaCaiNaRequisicaoSeguinteELoginPassaAserRecusado() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");
    TestUser session = api.login(target.id(), "alvo@teste.com");
    api.me(session.accessToken()).andExpect(status().isOk());
    int versionBefore = tokenVersion(target.id());

    api.suspend(admin, target.id(), REASON).andExpect(status().isNoContent());

    api.me(session.accessToken()).andExpect(status().isUnauthorized());
    assertThat(tokenVersion(target.id())).isGreaterThan(versionBefore);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL",
                Long.class,
                target.id()))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL",
                Long.class,
                target.id()))
        .isZero();
  }

  @Test
  void loginComSenhaCertaDa403AccountSuspendedComOrientacaoEsemOMotivo() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");
    api.suspend(admin, target.id(), REASON).andExpect(status().isNoContent());

    String body =
        api.login("alvo@teste.com", TestUsers.PASSWORD)
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"))
            .andExpect(jsonPath("$.supportHint").isString())
            .andExpect(responseMatchesContract())
            .andReturn()
            .getResponse()
            .getContentAsString();

    assertThat(body).doesNotContain(REASON).doesNotContain("4471");
    assertThat(body).doesNotContain("accessToken").doesNotContain("refreshToken");
  }

  @Test
  void senhaErradaDeContaSuspensaSegue401ComumSemRevelarASuspensao() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");
    seed.createUser("outro@teste.com");
    api.suspend(admin, target.id(), REASON).andExpect(status().isNoContent());

    JsonNode suspendedProblem =
        api.json(
            api.login("alvo@teste.com", "senha-errada-999")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS")));
    JsonNode commonProblem =
        api.json(
            api.login("outro@teste.com", "senha-errada-999").andExpect(status().isUnauthorized()));

    assertThat(suspendedProblem.get("detail")).isEqualTo(commonProblem.get("detail"));
    assertThat(suspendedProblem.get("title")).isEqualTo(commonProblem.get("title"));
    assertThat(suspendedProblem.has("supportHint")).isFalse();
    assertThat(auditCount("REVERT_ATTEMPT")).isZero();
  }

  @Test
  void reativarRestauraOAcessoENaoRessuscitaAsSessoesAntigas() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");
    TestUser old = api.login(target.id(), "alvo@teste.com");
    api.suspend(admin, target.id(), REASON).andExpect(status().isNoContent());
    api.login("alvo@teste.com", TestUsers.PASSWORD).andExpect(status().isForbidden());

    api.reactivate(admin, target.id())
        .andExpect(status().isNoContent())
        .andExpect(matchesContract());

    assertThat(suspended(target.id())).isFalse();
    TestUser fresh = api.login(target.id(), "alvo@teste.com");
    api.me(fresh.accessToken()).andExpect(status().isOk());
    api.me(old.accessToken()).andExpect(status().isUnauthorized());
    Map<String, Object> row = audit("USER_REACTIVATED");
    assertThat(row)
        .containsEntry("result", "SUCCESS")
        .containsEntry("actor_user_id", adminRow.id())
        .containsEntry("target_user_id", target.id());
    assertThat(row.get("reason_text")).isNull();
  }

  @Test
  void reativarContaQueNaoEstaSuspensaEIdempotente() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");

    api.reactivate(admin, target.id()).andExpect(status().isNoContent());
    api.reactivate(admin, target.id()).andExpect(status().isNoContent());

    assertThat(suspended(target.id())).isFalse();
    assertThat(auditCount("USER_REACTIVATED")).isEqualTo(2);
  }

  @Test
  void suspenderDeNovoNaoMudaAData() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");
    api.suspend(admin, target.id(), REASON).andExpect(status().isNoContent());
    Timestamp first =
        jdbc.queryForObject(
            "SELECT suspended_at FROM users WHERE id = ?", Timestamp.class, target.id());
    clock.advance(Duration.ofMinutes(5));

    api.suspend(admin, target.id(), "Outro motivo").andExpect(status().isNoContent());

    assertThat(
            jdbc.queryForObject(
                "SELECT suspended_at FROM users WHERE id = ?", Timestamp.class, target.id()))
        .isEqualTo(first);
  }

  @Test
  void suspenderGravaOInstanteDoRelogio() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");
    Instant now = clock.instant();

    api.suspend(admin, target.id(), REASON).andExpect(status().isNoContent());

    assertThat(
            jdbc.queryForObject(
                    "SELECT suspended_at FROM users WHERE id = ?", Timestamp.class, target.id())
                .toInstant())
        .isEqualTo(now);
  }

  @Test
  void naoHaAvisoAoUsuarioSuspensoNemReativado() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");

    api.suspend(admin, target.id(), REASON).andExpect(status().isNoContent());
    api.reactivate(admin, target.id()).andExpect(status().isNoContent());
    awaitPendingMails();

    assertThat(GREEN_MAIL.getReceivedMessages()).isEmpty();
  }

  @Test
  void detalheRefleteASuspensaoESessoesAbertasZeradas() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");
    api.login(target.id(), "alvo@teste.com");
    api.login(target.id(), "alvo@teste.com");
    assertThat(
            api.json(api.detail(admin, target.id()).andExpect(status().isOk()))
                .get("openSessions")
                .asInt())
        .isEqualTo(2);

    api.suspend(admin, target.id(), REASON).andExpect(status().isNoContent());

    JsonNode detail = api.json(api.detail(admin, target.id()).andExpect(status().isOk()));
    assertThat(detail.get("suspended").asBoolean()).isTrue();
    assertThat(detail.get("openSessions").asInt()).isZero();
  }

  // ------------------------------------------------------------------ exclusão pendente

  @Test
  void suspensaoCombinaComExclusaoPendenteEReativarMantemAExclusao() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");
    seed.scheduleDeletion(target.id(), clock.instant());

    api.suspend(admin, target.id(), REASON).andExpect(status().isNoContent());

    JsonNode suspendedDetail = api.json(api.detail(admin, target.id()).andExpect(status().isOk()));
    assertThat(suspendedDetail.get("suspended").asBoolean()).isTrue();
    assertThat(suspendedDetail.get("deletionPending").asBoolean()).isTrue();
    // a suspensão vem antes da exclusão pendente no login
    api.login("alvo@teste.com", TestUsers.PASSWORD)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"));

    api.reactivate(admin, target.id()).andExpect(status().isNoContent());

    JsonNode reactivated = api.json(api.detail(admin, target.id()).andExpect(status().isOk()));
    assertThat(reactivated.get("suspended").asBoolean()).isFalse();
    assertThat(reactivated.get("deletionPending").asBoolean()).isTrue();
    assertThat(
            jdbc.queryForObject(
                "SELECT deletion_origin FROM users WHERE id = ?", String.class, target.id()))
        .isEqualTo("USER");
    api.login("alvo@teste.com", TestUsers.PASSWORD)
        .andExpect(status().isLocked())
        .andExpect(jsonPath("$.code").value("ACCOUNT_DELETION_PENDING"));
  }

  // ------------------------------------------------------------------ redefinição de senha

  @Test
  void redefinicaoDeSenhaNaoReativaAContaSuspensa() throws Exception {
    SeededUser target = seed.createUser("alvo@teste.com");
    api.suspend(admin, target.id(), REASON).andExpect(status().isNoContent());
    String raw = TokenService.newRawToken();
    Instant now = clock.instant();
    jdbc.update(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)"
            + " VALUES (?, ?, ?, ?)",
        target.id(),
        TokenService.hash(raw),
        Timestamp.from(now.plus(Duration.ofMinutes(30))),
        Timestamp.from(now));

    mockMvc
        .perform(
            post("/auth/password-reset/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("token", raw, "newPassword", "nova-senha-segura-456"))))
        .andExpect(status().isNoContent());

    assertThat(suspended(target.id())).isTrue();
    api.login("alvo@teste.com", "nova-senha-segura-456")
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"));
  }

  // ------------------------------------------------------------------ recusas de regra

  @Test
  void suspenderASiMesmoEhRecusadoAuditadoESemEfeito() throws Exception {
    api.suspend(admin, adminRow.id(), REASON)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SELF_ACTION_FORBIDDEN"))
        .andExpect(responseMatchesContract());

    assertThat(suspended(adminRow.id())).isFalse();
    api.me(admin.accessToken()).andExpect(status().isOk());
    assertThat(audit("USER_SUSPENDED"))
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "SELF_ACTION_FORBIDDEN")
        .containsEntry("target_user_id", adminRow.id());
  }

  @Test
  void suspenderORaizEhRecusadoComRootProtected() throws Exception {
    SeededUser root = seed.createRoot("raiz@teste.com");

    api.suspend(admin, root.id(), REASON)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"))
        .andExpect(responseMatchesContract());

    assertThat(suspended(root.id())).isFalse();
    assertThat(audit("USER_SUSPENDED"))
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "ROOT_PROTECTED");
  }

  @Test
  void suspenderOutroAdministradorComumEPermitidoEOEfeitoVale() throws Exception {
    SeededUser other = seed.createAdmin("outro-adm@teste.com");
    TestUser otherToken = api.login(other.id(), "outro-adm@teste.com");

    api.suspend(admin, other.id(), REASON).andExpect(status().isNoContent());

    api.me(otherToken.accessToken()).andExpect(status().isUnauthorized());
    api.login("outro-adm@teste.com", TestUsers.PASSWORD).andExpect(status().isForbidden());
  }

  @Test
  void usuarioInexistenteDa404AuditadoSemAlvo() throws Exception {
    api.suspend(admin, 999_999L, REASON)
        .andExpect(status().isNotFound())
        .andExpect(responseMatchesContract());

    Map<String, Object> row = audit("USER_SUSPENDED");
    assertThat(row).containsEntry("result", "REFUSED").containsEntry("refusal_code", "NOT_FOUND");
    assertThat(row.get("target_user_id")).isNull();
  }

  @Test
  void reativarRaizEUsuarioInexistenteSaoRecusados() throws Exception {
    SeededUser root = seed.createRoot("raiz@teste.com");

    api.reactivate(admin, root.id())
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));
    api.reactivate(admin, 999_999L).andExpect(status().isNotFound());
  }
}
