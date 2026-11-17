package com.jvtech.gefinc.common.validation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jvtech.gefinc.support.AdminClient;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * O PostgreSQL recusa o byte NUL em texto. Texto livre com NUL que chega ao banco vira 500; aqui
 * cada entrada de texto das rotas de autenticação e do painel tem de ser recusada antes, como erro
 * do cliente (422 ou 400), nunca como 500.
 */
class NulInputIT extends IntegrationTestBase {

  private AdminClient api;
  private TestUser admin;
  private TestUser user;
  private SeededUser target;

  @BeforeEach
  void init() throws Exception {
    api = new AdminClient(mockMvc, objectMapper);
    SeededUser adminRow = seed.createAdmin("adm@teste.com");
    admin = api.login(adminRow.id(), "adm@teste.com");
    SeededUser userRow = seed.createUser("usuario@teste.com");
    user = api.login(userRow.id(), "usuario@teste.com");
    target = seed.createUser("alvo@teste.com");
  }

  /** Monta a requisição com os usuários já criados. */
  @FunctionalInterface
  interface Case {
    MockHttpServletRequestBuilder build(NulInputIT test);
  }

  static Stream<Arguments> nulInputs() {
    return Stream.of(
        arguments("GET /admin/users?q=%00", t -> t.adminGet("/admin/users").param("q", "\u0000")),
        arguments(
            "GET /admin/audit?action=%00",
            t -> t.adminGet("/admin/audit").param("action", "\u0000")),
        arguments(
            "GET /admin/audit?result=%00",
            t -> t.adminGet("/admin/audit").param("result", "\u0000")),
        arguments(
            "GET /admin/audit?cursor=%00",
            t -> t.adminGet("/admin/audit").param("cursor", "\u0000")),
        arguments(
            "GET /admin/audit?cursor=NUL no meio",
            t -> t.adminGet("/admin/audit").param("cursor", "MTIz\u0000NDU2")),
        arguments(
            "GET /admin/email/deliveries?status=%00",
            t -> t.adminGet("/admin/email/deliveries").param("status", "\u0000")),
        arguments(
            "GET /admin/email/deliveries?kind=%00",
            t -> t.adminGet("/admin/email/deliveries").param("kind", "\u0000")),
        arguments(
            "GET /admin/email/deliveries?cursor=%00",
            t -> t.adminGet("/admin/email/deliveries").param("cursor", "\u0000")),
        arguments(
            "POST /admin/users/{id}/suspend",
            t ->
                t.adminPost(
                    "/admin/users/" + t.target.id() + "/suspend", "{\"reason\":\"ab\\u0000cd\"}")),
        arguments(
            "POST /admin/users/{id}/password-reset/force",
            t ->
                t.adminPost(
                    "/admin/users/" + t.target.id() + "/password-reset/force",
                    "{\"password\":\"ab\\u0000cd\"}")),
        arguments(
            "POST /auth/login (e-mail)",
            t -> t.json(post("/auth/login"), "{\"email\":\"a\\u0000b@x.com\",\"password\":\"x\"}")),
        arguments(
            "PATCH /auth/me (nome)",
            t -> t.userJson(patch("/auth/me"), "{\"name\":\"An\\u0000a\"}")),
        arguments(
            "POST /auth/account-deletion/cancel (e-mail)",
            t ->
                t.json(
                    post("/auth/account-deletion/cancel"),
                    "{\"email\":\"a\\u0000b@x.com\",\"password\":\"x\"}")),
        arguments(
            "POST /auth/register (e-mail)",
            t ->
                t.json(
                    post("/auth/register"),
                    "{\"email\":\"a\\u0000b@x.com\",\"password\":\"senha-forte-123\"}")),
        arguments(
            "POST /auth/password-reset/request (e-mail)",
            t -> t.json(post("/auth/password-reset/request"), "{\"email\":\"a\\u0000b@x.com\"}")));
  }

  private static Arguments arguments(String name, Case request) {
    return Arguments.of(name, request);
  }

  MockHttpServletRequestBuilder adminGet(String uri) {
    return get(uri).header(HttpHeaders.AUTHORIZATION, admin.bearer());
  }

  MockHttpServletRequestBuilder adminPost(String uri, String body) {
    return post(uri)
        .header(HttpHeaders.AUTHORIZATION, admin.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(body);
  }

  MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
    return builder.contentType(MediaType.APPLICATION_JSON).content(body);
  }

  MockHttpServletRequestBuilder userJson(MockHttpServletRequestBuilder builder, String body) {
    return json(builder, body).header(HttpHeaders.AUTHORIZATION, user.bearer());
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("nulInputs")
  void textoComNulEhRecusadoComoErroDoClienteNuncaComo500(String name, Case request)
      throws Exception {
    MvcResult result = mockMvc.perform(request.build(this)).andReturn();

    assertThat(result.getResponse().getStatus()).isIn(400, 422);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE suspended_at IS NOT NULL", Long.class))
        .isZero();
  }
}
