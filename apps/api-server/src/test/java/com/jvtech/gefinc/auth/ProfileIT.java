package com.jvtech.gefinc.auth;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

class ProfileIT extends IntegrationTestBase {

  private static final String NEW_PASSWORD = "outra-senha-forte-456";

  private TestApi api;
  private TestUsers users;
  private TestUser ana;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    users = new TestUsers(mockMvc, objectMapper);
    ana = users.registerAndLogin("ana@example.com");
  }

  @Test
  void mostraOPerfilSemNomeAteOUsuarioInformar() throws Exception {
    api.call(ana, HttpMethod.GET, "/auth/me", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.email").value("ana@example.com"))
        .andExpect(jsonPath("$.name").doesNotExist());
  }

  @Test
  void alteraEApagaOnomeDeExibicao() throws Exception {
    api.call(ana, HttpMethod.PATCH, "/auth/me", Map.of("name", "  Ana Souza "))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.name").value("Ana Souza"));
    assertThat(api.get(ana, "/auth/me").get("name").asText()).isEqualTo("Ana Souza");

    api.call(ana, HttpMethod.PATCH, "/auth/me", Map.of("name", "   "))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").doesNotExist());
  }

  @Test
  void recusaNomeMuitoLongo() throws Exception {
    api.call(ana, HttpMethod.PATCH, "/auth/me", Map.of("name", "a".repeat(81)))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void trocaASenhaEDevolveNovaSessaoEncerrandoAsAntigas() throws Exception {
    JsonNode session =
        api.json(
            api.call(
                    ana,
                    HttpMethod.POST,
                    "/auth/password",
                    Map.of("currentPassword", TestUsers.PASSWORD, "newPassword", NEW_PASSWORD))
                .andExpect(status().isOk())
                .andExpect(matchesContract()));
    assertThat(session.get("accessToken").asText()).isNotBlank();

    // O token anterior deixou de valer; o novo vale; a senha antiga não entra mais.
    api.call(ana, HttpMethod.GET, "/auth/me", null).andExpect(status().isUnauthorized());
    TestUser renewed = new TestUser(ana.id(), ana.email(), session.get("accessToken").asText());
    api.call(renewed, HttpMethod.GET, "/auth/me", null).andExpect(status().isOk());
    users.login("ana@example.com", NEW_PASSWORD);
  }

  @Test
  void recusaSenhaAtualIncorretaENovaIgualAAtual() throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/auth/password",
            Map.of("currentPassword", "senha-errada-999", "newPassword", NEW_PASSWORD))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.errors[?(@.field=='currentPassword')]").exists());

    api.call(
            ana,
            HttpMethod.POST,
            "/auth/password",
            Map.of("currentPassword", TestUsers.PASSWORD, "newPassword", TestUsers.PASSWORD))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='newPassword')]").exists());

    api.call(
            ana,
            HttpMethod.POST,
            "/auth/password",
            Map.of("currentPassword", TestUsers.PASSWORD, "newPassword", "curta"))
        .andExpect(status().isUnprocessableEntity());
    // Nada mudou: a sessão atual segue valendo.
    api.call(ana, HttpMethod.GET, "/auth/me", null).andExpect(status().isOk());
  }
}
