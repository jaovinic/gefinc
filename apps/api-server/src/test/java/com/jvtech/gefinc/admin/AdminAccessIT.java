package com.jvtech.gefinc.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.common.AdminTestEndpoints;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Import;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Três camadas fecham o painel (regra de URL, {@code @AdminOnly} e este teste): toda rota sob
 * {@code /admin} responde 401 ao visitante e 403 ao usuário comum, e as negativas são auditadas uma
 * vez por janela e contadas (US1.2, US1.3, SC-001, SC-008).
 */
@Import(AdminTestEndpoints.class)
class AdminAccessIT extends IntegrationTestBase {

  /** Rotas esperadas hoje: as 4 de teste e a troca de papel; o número só cresce nas próximas US. */
  private static final int MINIMUM_ROUTES = 5;

  private static final String DENIED = "gefinc.admin.access.denied";
  private static final String IP = "198.51.100.20";

  private record Route(HttpMethod method, String pattern, Class<?> controller) {
    String path() {
      return pattern.replaceAll("\\{[^/}]+}", "1");
    }
  }

  @Autowired
  @Qualifier("requestMappingHandlerMapping")
  private RequestMappingHandlerMapping handlerMapping;

  private TestUsers users;
  private String commonToken;
  private String adminToken;

  @BeforeEach
  void users() throws Exception {
    users = new TestUsers(mockMvc, objectMapper);
    seed.createUser("comum@example.com");
    seed.createAdmin("adm@example.com");
    commonToken = token("comum@example.com");
    adminToken = token("adm@example.com");
  }

  private String token(String email) throws Exception {
    return users.login(email, TestUsers.PASSWORD).get("accessToken").asText();
  }

  private List<Route> adminRoutes() {
    List<Route> routes = new ArrayList<>();
    for (Map.Entry<RequestMappingInfo, HandlerMethod> entry :
        handlerMapping.getHandlerMethods().entrySet()) {
      RequestMappingInfo info = entry.getKey();
      Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
      var patterns = info.getPathPatternsCondition().getPatterns();
      for (var pattern : patterns) {
        if (!pattern.getPatternString().startsWith("/admin")) {
          continue;
        }
        Class<?> controller = entry.getValue().getBeanType();
        if (methods.isEmpty()) {
          routes.add(new Route(HttpMethod.GET, pattern.getPatternString(), controller));
        }
        for (RequestMethod method : methods) {
          routes.add(
              new Route(HttpMethod.valueOf(method.name()), pattern.getPatternString(), controller));
        }
      }
    }
    return routes;
  }

  private static RequestPostProcessor remoteAddr(String ip) {
    return request -> {
      request.setRemoteAddr(ip);
      return request;
    };
  }

  private MockHttpServletRequestBuilder request(Route route, String bearerToken) {
    MockHttpServletRequestBuilder builder =
        MockMvcRequestBuilders.request(route.method(), route.path())
            .with(
                request -> {
                  request.setRemoteAddr(IP);
                  return request;
                })
            .contentType(MediaType.APPLICATION_JSON)
            .content("{}");
    if (bearerToken != null) {
      builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken);
    }
    return builder;
  }

  @Test
  void enumeraTodasAsRotasAdminEExigeAdminOnlyNaClasse() {
    List<Route> routes = adminRoutes();

    assertThat(routes).hasSizeGreaterThanOrEqualTo(MINIMUM_ROUTES);
    for (Route route : routes) {
      assertThat(AnnotatedElementUtils.hasAnnotation(route.controller(), AdminOnly.class))
          .as(
              "@AdminOnly na classe %s (%s %s)",
              route.controller(), route.method(), route.pattern())
          .isTrue();
    }
  }

  @Test
  void visitanteRecebe401EmTodasAsRotasAdmin() throws Exception {
    for (Route route : adminRoutes()) {
      mockMvc
          .perform(request(route, null))
          .andExpect(status().isUnauthorized())
          .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
          .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }
  }

  @Test
  void usuarioComumRecebe403GenericoEmTodasAsRotasAdmin() throws Exception {
    for (Route route : adminRoutes()) {
      MvcResult result =
          mockMvc
              .perform(request(route, commonToken))
              .andExpect(status().isForbidden())
              .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
              .andExpect(jsonPath("$.code").value("FORBIDDEN"))
              .andReturn();
      String body = result.getResponse().getContentAsString();
      assertThat(body).doesNotContain("admin").doesNotContain("ROLE_").doesNotContain("role");
    }
  }

  @Test
  void administradorPassaDaBarreiraEmTodasAsRotasAdmin() throws Exception {
    for (Route route : adminRoutes()) {
      MvcResult result = mockMvc.perform(request(route, adminToken)).andReturn();
      assertThat(result.getResponse().getStatus())
          .as("%s %s", route.method(), route.pattern())
          .isNotEqualTo(401);
      String body = result.getResponse().getContentAsString();
      if (!body.isBlank() && body.startsWith("{")) {
        JsonNode json = objectMapper.readTree(body);
        assertThat(json.path("code").asText())
            .as("%s %s", route.method(), route.pattern())
            .isNotEqualTo("FORBIDDEN");
      }
    }
  }

  @Test
  void rotaInexistenteSobAdminNuncaDa404ParaQuemNaoEAdministrador() throws Exception {
    mockMvc.perform(get("/admin/nao-existe")).andExpect(status().isUnauthorized());
    mockMvc
        .perform(
            get("/admin/nao-existe").header(HttpHeaders.AUTHORIZATION, "Bearer " + commonToken))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(get("/admin/nao-existe").header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken))
        .andExpect(status().isNotFound());
  }

  @Test
  void duasNegativasIguaisDoUsuarioGeramUmaAuditoriaComIpEIncrementamOContador() throws Exception {
    long commonId =
        jdbc.queryForObject("SELECT id FROM users WHERE email = 'comum@example.com'", Long.class);
    double before = counter(DENIED);

    for (int i = 0; i < 2; i++) {
      mockMvc
          .perform(
              get("/admin/_test/read")
                  .with(
                      request -> {
                        request.setRemoteAddr(IP);
                        return request;
                      })
                  .header(HttpHeaders.AUTHORIZATION, "Bearer " + commonToken))
          .andExpect(status().isForbidden());
    }

    assertThat(counter(DENIED) - before).isEqualTo(2.0);
    Map<String, Object> row =
        jdbc.queryForMap("SELECT * FROM audit_log WHERE action = 'ACCESS_DENIED'");
    assertThat(row)
        .containsEntry("actor_kind", "USER")
        .containsEntry("actor_user_id", commonId)
        .containsEntry("result", "REFUSED")
        .containsEntry("subject", "/admin/_test/read");
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class)).isEqualTo(1);
    Map<String, Object> client = jdbc.queryForMap("SELECT * FROM audit_log_client");
    assertThat(client).containsEntry("ip", IP).containsEntry("user_id", commonId);
  }

  @Test
  void duasNegativasIguaisDoVisitanteGeramUmaAuditoriaComIpDeVisitante() throws Exception {
    double before = counter(DENIED);

    for (int i = 0; i < 2; i++) {
      mockMvc
          .perform(
              get("/admin/_test/read")
                  .with(
                      request -> {
                        request.setRemoteAddr(IP);
                        return request;
                      }))
          .andExpect(status().isUnauthorized());
    }

    assertThat(counter(DENIED) - before).isEqualTo(2.0);
    Map<String, Object> row =
        jdbc.queryForMap("SELECT * FROM audit_log WHERE action = 'ACCESS_DENIED'");
    assertThat(row).containsEntry("actor_kind", "VISITOR").containsEntry("result", "REFUSED");
    assertThat(row.get("actor_user_id")).isNull();
    assertThat(row.get("client_ref")).isNotNull();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class)).isEqualTo(1);
    Map<String, Object> client = jdbc.queryForMap("SELECT * FROM audit_log_client");
    assertThat(client).containsEntry("ip", IP);
    assertThat(client.get("user_id")).isNull();
  }

  @Test
  void rotasDistintasDoMesmoUsuarioEIpGeramUmaSoLinhaEContamTodas() throws Exception {
    double before = counter(DENIED);

    for (String path : List.of("/admin/a1", "/admin/a2", "/admin/users/7/role")) {
      mockMvc
          .perform(
              get(path)
                  .with(
                      request -> {
                        request.setRemoteAddr(IP);
                        return request;
                      })
                  .header(HttpHeaders.AUTHORIZATION, "Bearer " + commonToken))
          .andExpect(status().isForbidden());
    }

    assertThat(counter(DENIED) - before).isEqualTo(3.0);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log_client", Long.class))
        .isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT subject FROM audit_log", String.class))
        .isEqualTo("/admin/a1");
  }

  @Test
  void rotasDistintasDoMesmoVisitanteEIpGeramUmaSoLinhaEContamTodas() throws Exception {
    double before = counter(DENIED);

    for (String path : List.of("/admin/a1", "/admin/a2", "/admin/a3")) {
      mockMvc
          .perform(
              get(path)
                  .with(
                      request -> {
                        request.setRemoteAddr(IP);
                        return request;
                      }))
          .andExpect(status().isUnauthorized());
    }

    assertThat(counter(DENIED) - before).isEqualTo(3.0);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log_client", Long.class))
        .isEqualTo(1);
  }

  @Test
  void ipsDistintosContinuamGerandoLinhasDistintas() throws Exception {
    for (String ip : List.of("198.51.100.21", "198.51.100.22")) {
      mockMvc
          .perform(
              get("/admin/a1")
                  .with(
                      request -> {
                        request.setRemoteAddr(ip);
                        return request;
                      }))
          .andExpect(status().isUnauthorized());
    }

    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class)).isEqualTo(2);
  }

  @Test
  void tokenRejeitadoSoIncrementaOContadorEMantem401() throws Exception {
    double before = counter(DENIED);

    mockMvc
        .perform(get("/admin/_test/read").header(HttpHeaders.AUTHORIZATION, "Bearer invalido"))
        .andExpect(status().isUnauthorized());

    assertThat(counter(DENIED) - before).isEqualTo(1.0);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class)).isZero();
  }

  @Test
  void rotaNormalizadaSubstituiIdentificadoresEMantemOLimiteDoAssunto() throws Exception {
    mockMvc
        .perform(
            put("/admin/users/123/role")
                .with(remoteAddr("198.51.100.31"))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + commonToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
        .andExpect(status().isForbidden());
    mockMvc
        .perform(
            get("/admin/x/" + "a".repeat(120))
                .with(remoteAddr("198.51.100.32"))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + commonToken))
        .andExpect(status().isForbidden());

    List<String> subjects =
        jdbc.queryForList(
            "SELECT subject FROM audit_log WHERE action = 'ACCESS_DENIED' ORDER BY id",
            String.class);
    assertThat(subjects).hasSize(2);
    assertThat(subjects.get(0)).isEqualTo("/admin/users/{id}/role");
    assertThat(subjects.get(1)).hasSizeLessThanOrEqualTo(60);
  }

  @Test
  void falhaAoGravarAAuditoriaNuncaViraErro500() throws Exception {
    jdbc.execute("ALTER TABLE audit_log RENAME TO audit_log_off");
    try {
      mockMvc
          .perform(
              get("/admin/_test/read").header(HttpHeaders.AUTHORIZATION, "Bearer " + commonToken))
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    } finally {
      jdbc.execute("ALTER TABLE audit_log_off RENAME TO audit_log");
    }
  }
}
