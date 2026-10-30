package com.jvtech.gefinc.account;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/** Princípio III: um usuário nunca enxerga nem altera contas de outro. */
class AccountIsolationIT extends IntegrationTestBase {

  private TestUser ana;
  private TestUser bia;
  private long anaAccountId;

  @BeforeEach
  void init() throws Exception {
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    ana = users.registerAndLogin("ana@example.com");
    bia = users.registerAndLogin("bia@example.com");
    String json =
        mockMvc
            .perform(
                post("/accounts")
                    .header(HttpHeaders.AUTHORIZATION, ana.bearer())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        objectMapper.writeValueAsString(
                            Map.of("name", "Itaú", "type", "CHECKING", "holderType", "PF"))))
            .andReturn()
            .getResponse()
            .getContentAsString();
    anaAccountId = objectMapper.readTree(json).get("id").asLong();
  }

  @Test
  void outroUsuarioNaoEnxergaNaListagem() throws Exception {
    mockMvc
        .perform(get("/accounts").header(HttpHeaders.AUTHORIZATION, bia.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  void leituraEdicaoEExclusaoDeContaAlheiaRespondem404() throws Exception {
    mockMvc
        .perform(get("/accounts/" + anaAccountId).header(HttpHeaders.AUTHORIZATION, bia.bearer()))
        .andExpect(status().isNotFound());
    mockMvc
        .perform(
            put("/accounts/" + anaAccountId)
                .header(HttpHeaders.AUTHORIZATION, bia.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of(
                            "name",
                            "Invadida",
                            "type",
                            "CHECKING",
                            "holderType",
                            "PF",
                            "active",
                            true,
                            "version",
                            0))))
        .andExpect(status().isNotFound());
    mockMvc
        .perform(
            delete("/accounts/" + anaAccountId).header(HttpHeaders.AUTHORIZATION, bia.bearer()))
        .andExpect(status().isNotFound());

    mockMvc
        .perform(get("/accounts/" + anaAccountId).header(HttpHeaders.AUTHORIZATION, ana.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Itaú"));
  }

  @Test
  void mesmoNomeEmUsuariosDiferentesNaoConflita() throws Exception {
    mockMvc
        .perform(
            post("/accounts")
                .header(HttpHeaders.AUTHORIZATION, bia.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("name", "Itaú", "type", "CHECKING", "holderType", "PF"))))
        .andExpect(status().isCreated());
  }
}
