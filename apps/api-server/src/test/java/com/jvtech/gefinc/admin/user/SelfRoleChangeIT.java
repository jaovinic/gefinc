package com.jvtech.gefinc.admin.user;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Auto-alteração de papel (US1): - Administrador comum tentando conceder ou revogar o próprio papel
 * recebe 409 SELF_ACTION_FORBIDDEN. - Administrador raiz tentando conceder ou revogar o próprio
 * papel recebe 403 ROOT_PROTECTED (a proteção ao raiz tem precedência sobre a regra de
 * autoatendimento). Ambas as tentativas são auditadas como recusa e deixam o banco intacto.
 */
class SelfRoleChangeIT extends IntegrationTestBase {

  private TestApi api;
  private TestUsers users;

  @BeforeEach
  void init() {
    api = new TestApi(mockMvc, objectMapper);
    users = new TestUsers(mockMvc, objectMapper);
  }

  private TestUser login(SeededUser user, String email) throws Exception {
    String token = users.login(email, TestUsers.PASSWORD).get("accessToken").asText();
    return new TestUser(user.id(), email, token);
  }

  private String roleOf(long id) {
    return jdbc.queryForObject("SELECT role FROM users WHERE id = ?", String.class, id);
  }

  private Map<String, Object> lastAudit() {
    return jdbc.queryForMap("SELECT * FROM audit_log ORDER BY id DESC LIMIT 1");
  }

  @Test
  void administradorNaoAlteraOProprioPapelRecebeSelfActionForbiddenEAudita() throws Exception {
    SeededUser admin = seed.createAdmin("adm@example.com");
    TestUser session = login(admin, "adm@example.com");

    // Tentativa de revogar a si mesmo: USER
    api.call(
            session,
            HttpMethod.PUT,
            "/admin/users/" + admin.id() + "/role",
            Map.of("role", "USER", "password", TestUsers.PASSWORD))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SELF_ACTION_FORBIDDEN"))
        .andExpect(matchesContract());

    assertThat(roleOf(admin.id())).isEqualTo("ADMIN");
    Map<String, Object> revokeAudit = lastAudit();
    assertThat(revokeAudit)
        .containsEntry("action", "ROLE_REVOKED")
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "SELF_ACTION_FORBIDDEN")
        .containsEntry("actor_user_id", admin.id())
        .containsEntry("target_user_id", admin.id());

    // Tentativa de conceder a si mesmo: ADMIN
    api.call(
            session,
            HttpMethod.PUT,
            "/admin/users/" + admin.id() + "/role",
            Map.of("role", "ADMIN", "password", TestUsers.PASSWORD))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SELF_ACTION_FORBIDDEN"))
        .andExpect(matchesContract());

    assertThat(roleOf(admin.id())).isEqualTo("ADMIN");
    Map<String, Object> grantAudit = lastAudit();
    assertThat(grantAudit)
        .containsEntry("action", "ROLE_GRANTED")
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "SELF_ACTION_FORBIDDEN")
        .containsEntry("actor_user_id", admin.id())
        .containsEntry("target_user_id", admin.id());
  }

  @Test
  void raizTentandoAlterarOProprioPapelRecebeRootProtectedEAudita() throws Exception {
    SeededUser root = seed.createRoot("raiz@example.com");
    TestUser session = login(root, "raiz@example.com");

    // Tentativa de revogar a si mesmo
    api.call(
            session,
            HttpMethod.PUT,
            "/admin/users/" + root.id() + "/role",
            Map.of("role", "USER", "password", TestUsers.PASSWORD))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"))
        .andExpect(matchesContract());

    assertThat(roleOf(root.id())).isEqualTo("ROOT");
    Map<String, Object> revokeAudit = lastAudit();
    assertThat(revokeAudit)
        .containsEntry("action", "ROLE_REVOKED")
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "ROOT_PROTECTED")
        .containsEntry("actor_user_id", root.id())
        .containsEntry("target_user_id", root.id());

    // Tentativa de conceder a si mesmo
    api.call(
            session,
            HttpMethod.PUT,
            "/admin/users/" + root.id() + "/role",
            Map.of("role", "ADMIN", "password", TestUsers.PASSWORD))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"))
        .andExpect(matchesContract());

    assertThat(roleOf(root.id())).isEqualTo("ROOT");
    Map<String, Object> grantAudit = lastAudit();
    assertThat(grantAudit)
        .containsEntry("action", "ROLE_GRANTED")
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "ROOT_PROTECTED")
        .containsEntry("actor_user_id", root.id())
        .containsEntry("target_user_id", root.id());
  }
}
