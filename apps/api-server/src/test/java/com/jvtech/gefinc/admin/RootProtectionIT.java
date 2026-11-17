package com.jvtech.gefinc.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestTokens;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * O administrador raiz é intocável pelo painel (US1.4, SC-008): cada ação contra ele é recusada com
 * {@code ROOT_PROTECTED} antes de qualquer outra checagem, auditada e sem efeito. Têm endpoint hoje
 * o rebaixamento, a suspensão, o encerramento de sessões e a retirada do bloqueio de login; os
 * demais cenários ficam desabilitados e são ligados quando a ação existir.
 */
class RootProtectionIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser admin;
  private SeededUser root;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    SeededUser adminRow = seed.createAdmin("adm@example.com");
    root = seed.createRoot("raiz@example.com");
    String token =
        new TestUsers(mockMvc, objectMapper)
            .login("adm@example.com", TestUsers.PASSWORD)
            .get("accessToken")
            .asText();
    admin = new TestUser(adminRow.id(), "adm@example.com", token);
  }

  @Test
  void rebaixarORaizEhRecusadoAuditadoESemEfeito() throws Exception {
    api.call(
            admin,
            HttpMethod.PUT,
            "/admin/users/" + root.id() + "/role",
            Map.of("role", "USER", "password", TestUsers.PASSWORD))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));

    assertThat(jdbc.queryForObject("SELECT role FROM users WHERE id = ?", String.class, root.id()))
        .isEqualTo("ROOT");
    assertThat(
            jdbc.queryForMap("SELECT action, result, refusal_code, target_user_id FROM audit_log"))
        .containsEntry("action", "ROLE_REVOKED")
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "ROOT_PROTECTED")
        .containsEntry("target_user_id", root.id());
  }

  private void assertRefusedAndAudited(String action) {
    assertThat(
            jdbc.queryForMap(
                "SELECT result, refusal_code, target_user_id FROM audit_log WHERE action = ?",
                action))
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "ROOT_PROTECTED")
        .containsEntry("target_user_id", root.id());
  }

  @Test
  void suspenderORaizEhRecusadoAuditadoESemEfeito() throws Exception {
    api.call(
            admin, HttpMethod.POST, "/admin/users/" + root.id() + "/suspend", Map.of("reason", "x"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));

    assertThat(
            jdbc.queryForObject(
                "SELECT suspended_at IS NULL FROM users WHERE id = ?", Boolean.class, root.id()))
        .isTrue();
    assertRefusedAndAudited("USER_SUSPENDED");
  }

  @Test
  void reativarORaizEhRecusadoEAuditado() throws Exception {
    api.call(admin, HttpMethod.POST, "/admin/users/" + root.id() + "/reactivate", null)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));

    assertRefusedAndAudited("USER_REACTIVATED");
  }

  @Test
  void encerrarSessoesDoRaizEhRecusadoAuditadoESemEfeito() throws Exception {
    TestUser rootSession =
        new TestUser(
            root.id(),
            "raiz@example.com",
            new TestUsers(mockMvc, objectMapper)
                .login("raiz@example.com", TestUsers.PASSWORD)
                .get("accessToken")
                .asText());
    String sid = TestTokens.sessionId(rootSession.accessToken()).toString();

    api.call(admin, HttpMethod.DELETE, "/admin/users/" + root.id() + "/sessions", null)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));
    api.call(admin, HttpMethod.DELETE, "/admin/users/" + root.id() + "/sessions/" + sid, null)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));

    api.call(rootSession, HttpMethod.GET, "/auth/me", null).andExpect(status().isOk());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL",
                Long.class,
                root.id()))
        .isEqualTo(1);
    assertRefusedAndAudited("SESSIONS_REVOKED_ALL");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'SESSION_REVOKED'"
                    + " AND refusal_code = 'ROOT_PROTECTED' AND target_user_id = ?",
                Long.class,
                root.id()))
        .isEqualTo(1);
  }

  @Test
  void retirarOBloqueioDeLoginDoRaizEhRecusadoEAuditado() throws Exception {
    api.call(admin, HttpMethod.DELETE, "/admin/users/" + root.id() + "/login-lock", null)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));

    assertRefusedAndAudited("LOGIN_LOCK_CLEARED");
  }

  @Test
  @Disabled("Ligar na US10 (T139, exclusão administrativa): excluir o raiz deve dar ROOT_PROTECTED")
  void excluirORaizEhRecusado() {}

  @Test
  void trocarOEmailDoRaizEhRecusado() throws Exception {
    api.call(
            admin,
            HttpMethod.POST,
            "/admin/users/" + root.id() + "/email-change",
            Map.of("newEmail", "novo-raiz@teste.com"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));

    assertThat(jdbc.queryForObject("SELECT email FROM users WHERE id = ?", String.class, root.id()))
        .isEqualTo(root.email());
    assertThat(GREEN_MAIL.getReceivedMessages()).isEmpty();
    assertRefusedAndAudited("EMAIL_CHANGE_REQUESTED");
  }

  @Test
  void forcarRedefinicaoDeSenhaDoRaizEhRecusado() throws Exception {
    String hashBefore =
        jdbc.queryForObject(
            "SELECT password_hash FROM users WHERE id = ?", String.class, root.id());
    TestUser rootSession =
        new TestUser(
            root.id(),
            "raiz@example.com",
            new TestUsers(mockMvc, objectMapper)
                .login("raiz@example.com", TestUsers.PASSWORD)
                .get("accessToken")
                .asText());

    api.call(
            admin,
            HttpMethod.POST,
            "/admin/users/" + root.id() + "/password-reset/force",
            Map.of("password", TestUsers.PASSWORD))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));

    assertThat(
            jdbc.queryForObject(
                "SELECT password_hash FROM users WHERE id = ?", String.class, root.id()))
        .isEqualTo(hashBefore);
    api.call(rootSession, HttpMethod.GET, "/auth/me", null).andExpect(status().isOk());
    assertThat(GREEN_MAIL.getReceivedMessages()).isEmpty();
    assertRefusedAndAudited("PASSWORD_RESET_FORCED");
  }

  @Test
  void reenviarRedefinicaoDeSenhaDoRaizEhPermitidoEAuditado() throws Exception {
    api.call(admin, HttpMethod.POST, "/admin/users/" + root.id() + "/password-reset/send", null)
        .andExpect(status().isAccepted());

    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    assertThat(
            jdbc.queryForMap(
                "SELECT result, refusal_code, target_user_id FROM audit_log"
                    + " WHERE action = 'PASSWORD_RESET_SENT'"))
        .containsEntry("result", "SUCCESS")
        .containsEntry("refusal_code", null)
        .containsEntry("target_user_id", root.id());
  }

  @Test
  void renomearORaizEhPermitidoEAuditado() throws Exception {
    api.call(admin, HttpMethod.PATCH, "/admin/users/" + root.id(), Map.of("name", "Novo Nome Raiz"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(root.id()))
        .andExpect(jsonPath("$.name").value("Novo Nome Raiz"));

    assertThat(jdbc.queryForObject("SELECT name FROM users WHERE id = ?", String.class, root.id()))
        .isEqualTo("Novo Nome Raiz");
    assertThat(
            jdbc.queryForMap(
                "SELECT result, refusal_code, target_user_id FROM audit_log"
                    + " WHERE action = 'USER_RENAMED'"))
        .containsEntry("result", "SUCCESS")
        .containsEntry("refusal_code", null)
        .containsEntry("target_user_id", root.id());
  }
}
