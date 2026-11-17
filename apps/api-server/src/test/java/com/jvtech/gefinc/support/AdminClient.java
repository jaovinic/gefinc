package com.jvtech.gefinc.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Chamadas do painel sobre contas (suspensão, sessões e bloqueio de login) para os testes. */
public final class AdminClient {

  private final MockMvc mockMvc;
  private final ObjectMapper mapper;

  public AdminClient(MockMvc mockMvc, ObjectMapper mapper) {
    this.mockMvc = mockMvc;
    this.mapper = mapper;
  }

  /** Entra com o e-mail e devolve o usuário com o token de acesso vigente. */
  public TestUser login(long id, String email) throws Exception {
    JsonNode body = new TestUsers(mockMvc, mapper).login(email, TestUsers.PASSWORD);
    return new TestUser(id, email, body.get("accessToken").asText());
  }

  public ResultActions suspend(TestUser admin, long targetId, String reason) throws Exception {
    return mockMvc.perform(
        post("/admin/users/" + targetId + "/suspend")
            .header(HttpHeaders.AUTHORIZATION, admin.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of("reason", reason))));
  }

  public ResultActions suspendRaw(TestUser admin, long targetId, String json) throws Exception {
    return mockMvc.perform(
        post("/admin/users/" + targetId + "/suspend")
            .header(HttpHeaders.AUTHORIZATION, admin.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json));
  }

  public ResultActions reactivate(TestUser admin, long targetId) throws Exception {
    return mockMvc.perform(
        post("/admin/users/" + targetId + "/reactivate")
            .header(HttpHeaders.AUTHORIZATION, admin.bearer()));
  }

  public ResultActions sessions(TestUser admin, long targetId) throws Exception {
    return mockMvc.perform(
        get("/admin/users/" + targetId + "/sessions")
            .header(HttpHeaders.AUTHORIZATION, admin.bearer()));
  }

  public ResultActions revokeSession(TestUser admin, long targetId, String sessionId)
      throws Exception {
    return mockMvc.perform(
        delete("/admin/users/" + targetId + "/sessions/" + sessionId)
            .header(HttpHeaders.AUTHORIZATION, admin.bearer()));
  }

  public ResultActions revokeAllSessions(TestUser admin, long targetId) throws Exception {
    return mockMvc.perform(
        delete("/admin/users/" + targetId + "/sessions")
            .header(HttpHeaders.AUTHORIZATION, admin.bearer()));
  }

  public ResultActions clearLoginLock(TestUser admin, long targetId) throws Exception {
    return mockMvc.perform(
        delete("/admin/users/" + targetId + "/login-lock")
            .header(HttpHeaders.AUTHORIZATION, admin.bearer()));
  }

  public ResultActions detail(TestUser admin, long targetId) throws Exception {
    return mockMvc.perform(
        get("/admin/users/" + targetId).header(HttpHeaders.AUTHORIZATION, admin.bearer()));
  }

  /** Qualquer rota autenticada: serve para saber se o token de acesso ainda vale. */
  public ResultActions me(String accessToken) throws Exception {
    return mockMvc.perform(
        get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken));
  }

  public ResultActions login(String email, String password) throws Exception {
    return mockMvc.perform(
        post("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of("email", email, "password", password))));
  }

  public JsonNode json(ResultActions actions) throws Exception {
    return mapper.readTree(actions.andReturn().getResponse().getContentAsString());
  }
}
