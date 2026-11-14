package com.jvtech.gefinc.admin.user;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/**
 * {@code PUT /admin/users/{id}/role}: concede e retira o perfil de administrador com a senha do
 * próprio administrador, recusa o que a política proíbe e audita toda tentativa, inclusive as
 * recusadas. O cenário de último administrador não é alcançável em sequência (o ator é sempre um
 * administrador ativo diferente do alvo): ele é coberto por {@code LastAdminConcurrencyIT}
 * (corrida) e por {@code AdminPolicyTest} (regra).
 */
class AdminRoleIT extends IntegrationTestBase {

  private TestApi api;
  private TestUsers users;
  private TestUser admin;
  private SeededUser adminRow;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    users = new TestUsers(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm@example.com");
    admin = login(adminRow, "adm@example.com");
  }

  private TestUser login(SeededUser user, String email) throws Exception {
    return new TestUser(
        user.id(), email, users.login(email, TestUsers.PASSWORD).get("accessToken").asText());
  }

  private ResultActions putRole(TestUser actor, long targetId, String role, String password)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    if (role != null) {
      body.put("role", role);
    }
    if (password != null) {
      body.put("password", password);
    }
    return api.call(actor, HttpMethod.PUT, "/admin/users/" + targetId + "/role", body);
  }

  private String roleOf(long id) {
    return jdbc.queryForObject("SELECT role FROM users WHERE id = ?", String.class, id);
  }

  private Map<String, Object> lastAudit() {
    return jdbc.queryForMap("SELECT * FROM audit_log ORDER BY id DESC LIMIT 1");
  }

  private JsonNode details(Map<String, Object> row) throws Exception {
    return objectMapper.readTree(String.valueOf(row.get("details")));
  }

  private long auditCount() {
    return jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class);
  }

  @Test
  void concedeOPerfilComASenhaEAudita() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");

    putRole(admin, target.id(), "ADMIN", TestUsers.PASSWORD)
        .andExpect(status().isNoContent())
        .andExpect(matchesContract());

    assertThat(roleOf(target.id())).isEqualTo("ADMIN");
    Map<String, Object> audit = lastAudit();
    assertThat(audit)
        .containsEntry("action", "ROLE_GRANTED")
        .containsEntry("result", "SUCCESS")
        .containsEntry("actor_kind", "ADMIN")
        .containsEntry("actor_user_id", adminRow.id())
        .containsEntry("target_user_id", target.id());
    assertThat(audit.get("reason_text")).isNull();
    assertThat(details(audit).path("from").asText()).isEqualTo("USER");
    assertThat(details(audit).path("to").asText()).isEqualTo("ADMIN");
  }

  @Test
  void retiraOPerfilDeOutroAdministradorEAudita() throws Exception {
    SeededUser target = seed.createAdmin("outro@example.com");

    putRole(admin, target.id(), "USER", TestUsers.PASSWORD)
        .andExpect(status().isNoContent())
        .andExpect(matchesContract());

    assertThat(roleOf(target.id())).isEqualTo("USER");
    Map<String, Object> audit = lastAudit();
    assertThat(audit).containsEntry("action", "ROLE_REVOKED").containsEntry("result", "SUCCESS");
    assertThat(details(audit).path("from").asText()).isEqualTo("ADMIN");
    assertThat(details(audit).path("to").asText()).isEqualTo("USER");
  }

  @Test
  void operacoesIdempotentesRetornam204EAuditamDeIgualParaIgual() throws Exception {
    SeededUser alreadyAdmin = seed.createAdmin("outro@example.com");
    SeededUser alreadyUser = seed.createUser("comum@example.com");

    putRole(admin, alreadyAdmin.id(), "ADMIN", TestUsers.PASSWORD)
        .andExpect(status().isNoContent());
    Map<String, Object> grant = lastAudit();
    assertThat(grant).containsEntry("action", "ROLE_GRANTED");
    assertThat(details(grant).path("from").asText()).isEqualTo("ADMIN");
    assertThat(details(grant).path("to").asText()).isEqualTo("ADMIN");

    putRole(admin, alreadyUser.id(), "USER", TestUsers.PASSWORD).andExpect(status().isNoContent());
    Map<String, Object> revoke = lastAudit();
    assertThat(revoke).containsEntry("action", "ROLE_REVOKED");
    assertThat(details(revoke).path("from").asText()).isEqualTo("USER");
    assertThat(details(revoke).path("to").asText()).isEqualTo("USER");

    assertThat(roleOf(alreadyAdmin.id())).isEqualTo("ADMIN");
    assertThat(roleOf(alreadyUser.id())).isEqualTo("USER");
  }

  @Test
  void semSenhaOuComSenhaErradaDa403ReauthFailedAuditadoENadaMuda() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");

    putRole(admin, target.id(), "ADMIN", null)
        .andExpect(status().isForbidden())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("REAUTH_FAILED"))
        .andExpect(matchesContract());
    putRole(admin, target.id(), "ADMIN", "senha-errada-999")
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("REAUTH_FAILED"));

    assertThat(roleOf(target.id())).isEqualTo("USER");
    Map<String, Object> audit = lastAudit();
    assertThat(audit)
        .containsEntry("action", "ROLE_GRANTED")
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "REAUTH_FAILED")
        .containsEntry("actor_user_id", adminRow.id());
    // as duas recusas iguais na janela de 15 minutos viram uma linha
    assertThat(auditCount()).isEqualTo(1);
  }

  @Test
  void recusaSiMesmoComSelfActionForbiddenAuditado() throws Exception {
    putRole(admin, adminRow.id(), "USER", TestUsers.PASSWORD)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SELF_ACTION_FORBIDDEN"))
        .andExpect(matchesContract());

    assertThat(roleOf(adminRow.id())).isEqualTo("ADMIN");
    assertThat(lastAudit())
        .containsEntry("action", "ROLE_REVOKED")
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "SELF_ACTION_FORBIDDEN")
        .containsEntry("target_user_id", adminRow.id());
  }

  @Test
  void recusaOAdministradorRaizSemMudarNadaEAuditaOsDoisSentidos() throws Exception {
    SeededUser root = seed.createRoot("raiz@example.com");

    putRole(admin, root.id(), "USER", TestUsers.PASSWORD)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"))
        .andExpect(matchesContract());
    assertThat(lastAudit())
        .containsEntry("action", "ROLE_REVOKED")
        .containsEntry("refusal_code", "ROOT_PROTECTED");

    putRole(admin, root.id(), "ADMIN", TestUsers.PASSWORD)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));
    assertThat(lastAudit())
        .containsEntry("action", "ROLE_GRANTED")
        .containsEntry("refusal_code", "ROOT_PROTECTED");

    assertThat(roleOf(root.id())).isEqualTo("ROOT");
  }

  @Test
  void raizTambemNaoMudaOProprioPapelPeloPainel() throws Exception {
    SeededUser root = seed.createRoot("raiz@example.com");
    TestUser rootUser = login(root, "raiz@example.com");

    putRole(rootUser, root.id(), "USER", TestUsers.PASSWORD)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));

    assertThat(roleOf(root.id())).isEqualTo("ROOT");
  }

  @Test
  void concederExigeAlvoAtivoSuspensoOuEmExclusaoDa409() throws Exception {
    SeededUser suspended = seed.createUser("suspenso@example.com");
    jdbc.update("UPDATE users SET suspended_at = now() WHERE id = ?", suspended.id());
    SeededUser deleting = seed.createUser("exclusao@example.com");
    long ledger =
        jdbc.queryForObject(
            "INSERT INTO account_deletion_requests (user_id, origin, mode, grace_days, requested_at,"
                + " due_at, status, notice_state) VALUES (?, 'USER', 'GRACE', 30, now(),"
                + " now() + interval '720 hours', 'SCHEDULED', 'NOT_APPLICABLE') RETURNING id",
            Long.class,
            deleting.id());
    jdbc.update(
        "UPDATE users SET deletion_requested_at = now(), deletion_due_at = now() + interval"
            + " '720 hours', deletion_origin = 'USER', deletion_request_id = ? WHERE id = ?",
        ledger,
        deleting.id());

    for (SeededUser target : List.of(suspended, deleting)) {
      putRole(admin, target.id(), "ADMIN", TestUsers.PASSWORD)
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_USABLE"))
          .andExpect(matchesContract());
      assertThat(roleOf(target.id())).isEqualTo("USER");
      assertThat(lastAudit())
          .containsEntry("action", "ROLE_GRANTED")
          .containsEntry("result", "REFUSED")
          .containsEntry("refusal_code", "ACCOUNT_NOT_USABLE")
          .containsEntry("target_user_id", target.id());
    }
  }

  @Test
  void retirarOPerfilDeAdministradorSuspensoEPermitido() throws Exception {
    SeededUser suspendedAdmin = seed.createAdmin("suspenso@example.com");
    jdbc.update("UPDATE users SET suspended_at = now() WHERE id = ?", suspendedAdmin.id());

    putRole(admin, suspendedAdmin.id(), "USER", TestUsers.PASSWORD)
        .andExpect(status().isNoContent());

    assertThat(roleOf(suspendedAdmin.id())).isEqualTo("USER");
  }

  @Test
  void usuarioInexistenteDa404() throws Exception {
    putRole(admin, 987654L, "ADMIN", TestUsers.PASSWORD)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"))
        .andExpect(matchesContract());
  }

  @Test
  void papelInvalidoOuAusenteDa422SemTocarNoBanco() throws Exception {
    SeededUser target = seed.createUser("alvo@example.com");

    for (String role : new String[] {"ROOT", "SUPER", "", null}) {
      putRole(admin, target.id(), role, TestUsers.PASSWORD)
          .andExpect(status().isUnprocessableEntity())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    assertThat(roleOf(target.id())).isEqualTo("USER");
    assertThat(auditCount()).isZero();
  }

  @Test
  void usuarioComumNaoMudaPapeisNemOproprio() throws Exception {
    SeededUser commonRow = seed.createUser("comum@example.com");
    TestUser common = login(commonRow, "comum@example.com");

    putRole(common, commonRow.id(), "ADMIN", TestUsers.PASSWORD)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));

    assertThat(roleOf(commonRow.id())).isEqualTo("USER");
  }
}
