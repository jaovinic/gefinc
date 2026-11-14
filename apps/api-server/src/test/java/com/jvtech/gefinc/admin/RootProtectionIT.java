package com.jvtech.gefinc.admin;

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
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * O administrador raiz é intocável pelo painel (US1.4, SC-008): cada ação contra ele é recusada com
 * {@code ROOT_PROTECTED} antes de qualquer outra checagem, auditada e sem efeito. Aqui só o
 * rebaixamento tem endpoint; os demais cenários ficam desabilitados e são ligados quando a ação
 * existir.
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

  @Test
  @Disabled("Ligar na US3 (T074, suspensão): suspender o raiz deve dar ROOT_PROTECTED")
  void suspenderORaizEhRecusado() {}

  @Test
  @Disabled("Ligar na US10 (T139, exclusão administrativa): excluir o raiz deve dar ROOT_PROTECTED")
  void excluirORaizEhRecusado() {}

  @Test
  @Disabled("Ligar na US9 (T127, troca de e-mail): trocar o e-mail do raiz deve dar ROOT_PROTECTED")
  void trocarOEmailDoRaizEhRecusado() {}

  @Test
  @Disabled(
      "Ligar na US4 (T091, redefinição de senha): forçar redefinição do raiz deve dar ROOT_PROTECTED")
  void forcarRedefinicaoDeSenhaDoRaizEhRecusado() {}

  @Test
  @Disabled("Ligar na US3 (T074, sessões): encerrar as sessões do raiz deve dar ROOT_PROTECTED")
  void encerrarSessoesDoRaizEhRecusado() {}
}
