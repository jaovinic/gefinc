package com.jvtech.gefinc.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Cria e autentica usuários de teste pelos próprios endpoints da API. */
public final class TestUsers {

  public static final String PASSWORD = "senha-forte-123";

  public record TestUser(long id, String email, String accessToken) {
    public String bearer() {
      return "Bearer " + accessToken;
    }
  }

  private final MockMvc mockMvc;
  private final ObjectMapper mapper;

  public TestUsers(MockMvc mockMvc, ObjectMapper mapper) {
    this.mockMvc = mockMvc;
    this.mapper = mapper;
  }

  /** Cadastra o usuário, faz login e devolve o token de acesso. */
  public TestUser registerAndLogin(String email) throws Exception {
    String body = mapper.writeValueAsString(Map.of("email", email, "password", PASSWORD));
    String registered =
        mockMvc
            .perform(post("/auth/register").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    long id = mapper.readTree(registered).get("id").asLong();
    return new TestUser(id, email, login(email, PASSWORD).get("accessToken").asText());
  }

  public JsonNode login(String email, String password) throws Exception {
    String body = mapper.writeValueAsString(Map.of("email", email, "password", password));
    String response =
        mockMvc
            .perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return mapper.readTree(response);
  }
}
