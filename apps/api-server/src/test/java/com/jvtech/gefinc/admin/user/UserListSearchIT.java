package com.jvtech.gefinc.admin.user;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static com.jvtech.gefinc.support.ContractAssertions.responseMatchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * {@code GET /admin/users}: paginação (25 por padrão, no máximo 100), busca sem caixa e sem acento,
 * curingas {@code %}, {@code _} e {@code \} tratados como texto, filtros por situação, ordenação
 * estável por {@code (campo, id)}, contagens por situação e tempo de resposta com 10.000 usuários
 * (SC-002). A lista não é auditada (coberto em {@code UserDetailAuditIT}).
 */
class UserListSearchIT extends IntegrationTestBase {

  private static final Instant BASE = Instant.parse("2026-01-01T12:00:00Z");

  private TestUser admin;
  private SeededUser adminRow;

  @BeforeEach
  void init() throws Exception {
    adminRow = seed.createAdmin("adm@example.com");
    seed.setDates(adminRow.id(), BASE.minus(Duration.ofDays(400)), null);
    admin = login("adm@example.com");
  }

  private TestUser login(String email) throws Exception {
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    return new TestUser(
        0, email, users.login(email, TestUsers.PASSWORD).get("accessToken").asText());
  }

  private ResultActions call(TestUser actor, Map<String, String> params) throws Exception {
    MockHttpServletRequestBuilder request =
        get("/admin/users").header(HttpHeaders.AUTHORIZATION, actor.bearer());
    params.forEach(request::param);
    return mockMvc.perform(request);
  }

  private JsonNode list(Map<String, String> params) throws Exception {
    ResultActions result =
        call(admin, params).andExpect(status().isOk()).andExpect(matchesContract());
    return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
  }

  private static Map<String, String> params(String... keyValues) {
    Map<String, String> map = new LinkedHashMap<>();
    for (int i = 0; i < keyValues.length; i += 2) {
      map.put(keyValues[i], keyValues[i + 1]);
    }
    return map;
  }

  private static List<String> emails(JsonNode page) {
    List<String> emails = new ArrayList<>();
    page.get("content").forEach(row -> emails.add(row.get("email").asText()));
    return emails;
  }

  private SeededUser user(String email, String name) {
    SeededUser created = seed.createUser(email);
    if (name != null) {
      seed.setName(created.id(), name);
    }
    return created;
  }

  // ------------------------------------------------------------------ paginação

  @Test
  void paginaDe25PorPadraoEUmaLinhaTemSoCamposDeConta() throws Exception {
    for (int i = 1; i <= 30; i++) {
      user(String.format("p%02d@page.test", i), null);
    }

    JsonNode first = list(params("q", "page.test"));

    assertThat(first.get("page").asInt()).isZero();
    assertThat(first.get("size").asInt()).isEqualTo(25);
    assertThat(first.get("totalElements").asLong()).isEqualTo(30);
    assertThat(first.get("content")).hasSize(25);
    // Nome e último acesso nulos são omitidos; nunca há dado financeiro nem IP na linha.
    JsonNode row = first.get("content").get(0);
    assertThat(row.fieldNames())
        .toIterable()
        .containsExactlyInAnyOrder(
            "id", "email", "createdAt", "role", "suspended", "deletionPending");
    JsonNode second = list(params("q", "page.test", "page", "1"));
    assertThat(second.get("content")).hasSize(5);
    JsonNode beyond = list(params("q", "page.test", "page", "9"));
    assertThat(beyond.get("content")).isEmpty();
    assertThat(beyond.get("totalElements").asLong()).isEqualTo(30);
  }

  @Test
  void aceitaTamanhoAte100() throws Exception {
    for (int i = 1; i <= 120; i++) {
      user(String.format("t%03d@size.test", i), null);
    }

    JsonNode page = list(params("q", "size.test", "size", "100"));

    assertThat(page.get("size").asInt()).isEqualTo(100);
    assertThat(page.get("content")).hasSize(100);
    assertThat(page.get("totalElements").asLong()).isEqualTo(120);
  }

  @Test
  void parametrosForaDosLimitesDoContratoDao422() throws Exception {
    List<String[]> invalid =
        List.of(
            new String[] {"size", "101"},
            new String[] {"size", "0"},
            new String[] {"page", "-1"},
            new String[] {"status", "TODOS"},
            new String[] {"sort", "email"},
            new String[] {"dir", "up"},
            new String[] {"q", "x".repeat(101)});
    for (String[] parameter : invalid) {
      call(admin, params(parameter[0], parameter[1]))
          .andExpect(status().isUnprocessableEntity())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
          .andExpect(jsonPath("$.errors[0].field").value(parameter[0]))
          .andExpect(responseMatchesContract());
    }
  }

  @Test
  void qComExatamente100CaracteresEAceita() throws Exception {
    JsonNode page = list(params("q", "x".repeat(100)));

    assertThat(page.get("content")).isEmpty();
  }

  // ------------------------------------------------------------------ busca

  @Test
  void buscaIgnoraCaixaEAcentoNoNomeENoEmail() throws Exception {
    user("contato@x.test", "João Pereira");
    user("zeca@x.test", "José Souza");
    user("AnA.Silva@Example.com", null);
    user("outro@x.test", "Maria Lima");

    assertThat(emails(list(params("q", "joao")))).containsExactly("contato@x.test");
    assertThat(emails(list(params("q", "JOÃO")))).containsExactly("contato@x.test");
    assertThat(emails(list(params("q", "pereira")))).containsExactly("contato@x.test");
    assertThat(emails(list(params("q", "jose")))).containsExactly("zeca@x.test");
    assertThat(emails(list(params("q", "josé")))).containsExactly("zeca@x.test");
    assertThat(emails(list(params("q", "ANA.silva")))).containsExactly("AnA.Silva@Example.com");
    assertThat(emails(list(params("q", "@x.test"))))
        .containsExactlyInAnyOrder("contato@x.test", "zeca@x.test", "outro@x.test");
  }

  @Test
  void buscaVaziaOuEmBrancoNaoFiltra() throws Exception {
    user("a@x.test", null);

    assertThat(list(params("q", "")).get("totalElements").asLong()).isEqualTo(2);
    assertThat(list(params()).get("totalElements").asLong()).isEqualTo(2);
  }

  @Test
  void porcentoSublinhadoEBarraInvertidaSaoTextoLiteral() throws Exception {
    user("pct@w.test", "100% real");
    user("under@w.test", "a_b");
    user("slash@w.test", "back\\slash");
    user("decoy1@w.test", "100 real");
    user("decoy2@w.test", "axb");
    user("decoy3@w.test", "backslash");

    assertThat(emails(list(params("q", "%")))).containsExactly("pct@w.test");
    assertThat(emails(list(params("q", "100%")))).containsExactly("pct@w.test");
    assertThat(emails(list(params("q", "_")))).containsExactly("under@w.test");
    assertThat(emails(list(params("q", "a_b")))).containsExactly("under@w.test");
    assertThat(emails(list(params("q", "\\")))).containsExactly("slash@w.test");
    assertThat(emails(list(params("q", "back\\s")))).containsExactly("slash@w.test");
  }

  // ------------------------------------------------------------------ filtros e contagens

  private void seedSituations() {
    // admin (do init): ativo e administrador. Abaixo: raiz, 2 ativos, 2 suspensos, 1 em exclusão e
    // 1 suspenso que também aguarda exclusão.
    seed.createRoot("raiz@sit.test");
    user("u1@sit.test", null);
    user("u2@sit.test", null);
    SeededUser s1 = user("s1@sit.test", null);
    SeededUser s2 = user("s2@sit.test", null);
    SeededUser d1 = user("d1@sit.test", null);
    SeededUser sd = user("sd@sit.test", null);
    seed.suspend(s1.id(), BASE);
    seed.suspend(s2.id(), BASE);
    seed.scheduleDeletion(d1.id(), BASE);
    seed.suspend(sd.id(), BASE);
    seed.scheduleDeletion(sd.id(), BASE);
  }

  @Test
  void filtraPorSituacao() throws Exception {
    seedSituations();

    assertThat(emails(list(params("status", "ACTIVE"))))
        .containsExactlyInAnyOrder(
            "adm@example.com", "raiz@sit.test", "u1@sit.test", "u2@sit.test");
    assertThat(emails(list(params("status", "SUSPENDED"))))
        .containsExactlyInAnyOrder("s1@sit.test", "s2@sit.test", "sd@sit.test");
    assertThat(emails(list(params("status", "DELETION_PENDING"))))
        .containsExactlyInAnyOrder("d1@sit.test", "sd@sit.test");
    assertThat(emails(list(params("status", "ADMIN"))))
        .containsExactlyInAnyOrder("adm@example.com", "raiz@sit.test");
  }

  @Test
  void linhasTraduzemASituacaoEOPerfil() throws Exception {
    seedSituations();

    JsonNode page = list(params("q", "sit.test", "size", "100"));

    Map<String, JsonNode> byEmail = new LinkedHashMap<>();
    page.get("content").forEach(row -> byEmail.put(row.get("email").asText(), row));
    assertThat(byEmail.get("raiz@sit.test").get("role").asText()).isEqualTo("ROOT");
    assertThat(byEmail.get("u1@sit.test").get("role").asText()).isEqualTo("USER");
    assertThat(byEmail.get("s1@sit.test").get("suspended").asBoolean()).isTrue();
    assertThat(byEmail.get("s1@sit.test").get("deletionPending").asBoolean()).isFalse();
    assertThat(byEmail.get("d1@sit.test").get("deletionPending").asBoolean()).isTrue();
    assertThat(byEmail.get("sd@sit.test").get("suspended").asBoolean()).isTrue();
    assertThat(byEmail.get("sd@sit.test").get("deletionPending").asBoolean()).isTrue();
  }

  @Test
  void contagensPorSituacaoIgnoramOFiltroDeSituacaoEObedecemABusca() throws Exception {
    seedSituations();

    JsonNode all = list(params());
    assertThat(all.get("totalElements").asLong()).isEqualTo(8);
    assertCounts(all.get("counts"), 4, 3, 2, 2);

    JsonNode filtered = list(params("status", "SUSPENDED"));
    assertThat(filtered.get("totalElements").asLong()).isEqualTo(3);
    assertCounts(filtered.get("counts"), 4, 3, 2, 2);

    JsonNode searched = list(params("q", "sit.test", "status", "ADMIN"));
    assertThat(searched.get("totalElements").asLong()).isEqualTo(1);
    assertCounts(searched.get("counts"), 3, 3, 2, 1);
  }

  private static void assertCounts(
      JsonNode counts, long active, long suspended, long deletionPending, long admin) {
    assertThat(counts.get("active").asLong()).as("active").isEqualTo(active);
    assertThat(counts.get("suspended").asLong()).as("suspended").isEqualTo(suspended);
    assertThat(counts.get("deletionPending").asLong())
        .as("deletionPending")
        .isEqualTo(deletionPending);
    assertThat(counts.get("admin").asLong()).as("admin").isEqualTo(admin);
  }

  // ------------------------------------------------------------------ ordenação

  @Test
  void ordenaPorCriacaoDoMaisNovoParaOMaisAntigoPorPadrao() throws Exception {
    for (int i = 1; i <= 4; i++) {
      SeededUser u = user("c" + i + "@ord.test", null);
      seed.setDates(u.id(), BASE.plus(Duration.ofMinutes(i)), null);
    }

    assertThat(emails(list(params("q", "ord.test"))))
        .containsExactly("c4@ord.test", "c3@ord.test", "c2@ord.test", "c1@ord.test");
    assertThat(emails(list(params("q", "ord.test", "sort", "createdAt", "dir", "asc"))))
        .containsExactly("c1@ord.test", "c2@ord.test", "c3@ord.test", "c4@ord.test");
  }

  @Test
  void empatesDesempatamPorIdEFicamEstaveisEntrePaginas() throws Exception {
    List<Long> ids = new ArrayList<>();
    for (int i = 1; i <= 7; i++) {
      SeededUser u = user("e" + i + "@tie.test", null);
      seed.setDates(u.id(), BASE, BASE);
      ids.add(u.id());
    }

    for (String sort : List.of("createdAt", "lastAccessAt")) {
      List<Long> descending = new ArrayList<>(ids);
      Collections.reverse(descending);
      assertThat(pagedIds(sort, "desc")).as(sort + " desc").containsExactlyElementsOf(descending);
      assertThat(pagedIds(sort, "asc")).as(sort + " asc").containsExactlyElementsOf(ids);
    }
  }

  private List<Long> pagedIds(String sort, String dir) throws Exception {
    List<Long> seen = new ArrayList<>();
    for (int page = 0; page < 3; page++) {
      JsonNode result =
          list(params("q", "tie.test", "sort", sort, "dir", dir, "size", "3", "page", "" + page));
      result.get("content").forEach(row -> seen.add(row.get("id").asLong()));
    }
    return seen;
  }

  @Test
  void ordenaPorUltimoAcessoComQuemNuncaEntrouSempreNoFim() throws Exception {
    SeededUser a = user("a@acc.test", null);
    SeededUser b = user("b@acc.test", null);
    user("c@acc.test", null);
    user("d@acc.test", null);
    seed.setDates(a.id(), BASE, BASE.plus(Duration.ofHours(1)));
    seed.setDates(b.id(), BASE, BASE.plus(Duration.ofHours(2)));

    assertThat(emails(list(params("q", "acc.test", "sort", "lastAccessAt", "dir", "desc"))))
        .containsExactly("b@acc.test", "a@acc.test", "d@acc.test", "c@acc.test");
    assertThat(emails(list(params("q", "acc.test", "sort", "lastAccessAt", "dir", "asc"))))
        .containsExactly("a@acc.test", "b@acc.test", "c@acc.test", "d@acc.test");
  }

  // ------------------------------------------------------------------ acesso

  @Test
  void usuarioComumRecebe403() throws Exception {
    seed.createUser("comum@example.com");
    TestUser common = login("comum@example.com");

    call(common, params()).andExpect(status().isForbidden());
  }

  // ------------------------------------------------------------------ desempenho (SC-002)

  /**
   * Com 10.000 usuários a busca por nome responde em bem menos de 300 ms. Mede a mediana de 7
   * execuções depois de uma de aquecimento (plano de consulta e conexões), o que tira o ruído de
   * partida a frio sem esconder uma varredura lenta: o limite do aceite é 300 ms, e a consulta
   * típica leva alguns milissegundos.
   */
  @Test
  void buscaComDezMilUsuariosRespondeEmMenosDe300Ms() throws Exception {
    jdbc.update(
        "INSERT INTO users (email, name, password_hash, role, created_at)"
            + " SELECT 'user' || g || '@bulk.test',"
            + " CASE WHEN g % 7 = 0 THEN 'João ' || g ELSE 'Maria ' || g END,"
            + " 'x', 'USER', now() - g * interval '1 minute'"
            + " FROM generate_series(1, 10000) g");
    jdbc.execute("ANALYZE users");

    JsonNode warm = list(params("q", "joao"));
    assertThat(warm.get("totalElements").asLong()).isEqualTo(1428);

    List<Long> millis = new ArrayList<>();
    for (int i = 0; i < 7; i++) {
      long start = System.nanoTime();
      JsonNode page = list(params("q", "JOÃO 7", "sort", "lastAccessAt"));
      millis.add(Duration.ofNanos(System.nanoTime() - start).toMillis());
      assertThat(page.get("totalElements").asLong()).isPositive();
    }
    Collections.sort(millis);
    assertThat(millis.get(millis.size() / 2)).as("mediana em ms: %s", millis).isLessThan(300);
  }
}
