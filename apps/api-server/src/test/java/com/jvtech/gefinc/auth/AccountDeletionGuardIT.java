package com.jvtech.gefinc.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Guarda mínima do autoatendimento de exclusão (US1.6): o raiz nunca se exclui (estouraria {@code
 * ck_users_root_active}) e o último administrador ativo não deixa o sistema sem administrador.
 */
class AccountDeletionGuardIT extends IntegrationTestBase {

  private ResultActions requestDeletion(String email) throws Exception {
    String token =
        new TestUsers(mockMvc, objectMapper)
            .login(email, TestUsers.PASSWORD)
            .get("accessToken")
            .asText();
    return mockMvc.perform(
        post("/auth/account-deletion")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("password", TestUsers.PASSWORD))));
  }

  private boolean deletionPending(long id) {
    return jdbc.queryForObject(
        "SELECT deletion_requested_at IS NOT NULL FROM users WHERE id = ?", Boolean.class, id);
  }

  @Test
  void raizNaoPodeSolicitarAPropriaExclusao() throws Exception {
    SeededUser root = seed.createRoot("raiz@example.com");

    requestDeletion("raiz@example.com")
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));

    assertThat(deletionPending(root.id())).isFalse();
  }

  @Test
  void ultimoAdministradorAtivoNaoPodeSolicitarAExclusao() throws Exception {
    SeededUser admin = seed.createAdmin("adm@example.com");

    requestDeletion("adm@example.com")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LAST_ADMIN"));

    assertThat(deletionPending(admin.id())).isFalse();
  }

  @Test
  void administradorSuspensoOuEmExclusaoNaoContaComoOutroAdministrador() throws Exception {
    SeededUser admin = seed.createAdmin("adm@example.com");
    SeededUser suspended = seed.createAdmin("suspenso@example.com");
    jdbc.update("UPDATE users SET suspended_at = now() WHERE id = ?", suspended.id());

    requestDeletion("adm@example.com")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LAST_ADMIN"));

    assertThat(deletionPending(admin.id())).isFalse();
  }

  @Test
  void administradorComOutroAdministradorAtivoPodeSolicitar() throws Exception {
    SeededUser admin = seed.createAdmin("adm@example.com");
    seed.createAdmin("outro@example.com");

    requestDeletion("adm@example.com").andExpect(status().isAccepted());

    assertThat(deletionPending(admin.id())).isTrue();
  }

  @Test
  void raizAtivoContaComoOutroAdministrador() throws Exception {
    SeededUser admin = seed.createAdmin("adm@example.com");
    seed.createRoot("raiz@example.com");

    requestDeletion("adm@example.com").andExpect(status().isAccepted());

    assertThat(deletionPending(admin.id())).isTrue();
  }

  @Test
  void usuarioComumContinuaPodendoSolicitar() throws Exception {
    SeededUser common = seed.createUser("comum@example.com");

    requestDeletion("comum@example.com").andExpect(status().isAccepted());

    assertThat(deletionPending(common.id())).isTrue();
  }
}
