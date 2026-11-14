package com.jvtech.gefinc.admin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.admin.common.AdminTestEndpoints;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/**
 * O papel vem do banco a cada requisição (o JWT não o carrega): conceder ou retirar o perfil vale
 * na requisição seguinte, com o mesmo token de acesso (US1.5, SC-020).
 */
@Import(AdminTestEndpoints.class)
class RoleChangeTakesEffectIT extends IntegrationTestBase {

  private SeededUser alvo;
  private String alvoToken;
  private String adminToken;

  @BeforeEach
  void init() throws Exception {
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    seed.createAdmin("adm@example.com");
    alvo = seed.createUser("alvo@example.com");
    adminToken = users.login("adm@example.com", TestUsers.PASSWORD).get("accessToken").asText();
    alvoToken = users.login("alvo@example.com", TestUsers.PASSWORD).get("accessToken").asText();
  }

  private ResultActions leituraDoAlvo() throws Exception {
    return mockMvc.perform(
        get("/admin/_test/read").header(HttpHeaders.AUTHORIZATION, "Bearer " + alvoToken));
  }

  private ResultActions mudarPapel(String role) throws Exception {
    return mockMvc.perform(
        put("/admin/users/" + alvo.id() + "/role")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                objectMapper.writeValueAsString(
                    Map.of("role", role, "password", TestUsers.PASSWORD))));
  }

  @Test
  void concederEretirarOPerfilValemNaRequisicaoSeguinteComOMesmoToken() throws Exception {
    leituraDoAlvo().andExpect(status().isForbidden());

    mudarPapel("ADMIN").andExpect(status().isNoContent());
    leituraDoAlvo().andExpect(status().isOk());

    mudarPapel("USER").andExpect(status().isNoContent());
    leituraDoAlvo().andExpect(status().isForbidden());
  }

  @Test
  void perfilRetiradoDeQuemEstaLogadoValeDeImediatoNasRotasAdmin() throws Exception {
    mudarPapel("ADMIN").andExpect(status().isNoContent());
    leituraDoAlvo().andExpect(status().isOk());

    jdbc.update("UPDATE users SET role = 'USER' WHERE id = ?", alvo.id());

    leituraDoAlvo().andExpect(status().isForbidden());
  }
}
