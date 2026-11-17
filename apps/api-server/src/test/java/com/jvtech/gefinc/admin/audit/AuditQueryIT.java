package com.jvtech.gefinc.admin.audit;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static com.jvtech.gefinc.support.ContractAssertions.responseMatchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.admin.common.KeysetCursor;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.common.security.RequestOrigin;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import jakarta.persistence.EntityManagerFactory;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Leitura da trilha ({@code GET /admin/audit} e {@code GET /admin/audit/{id}}): filtros, ordem
 * {@code (occurred_at, id)} decrescente, cursor estável, detalhe com motivo e IP, rótulos
 * resolvidos em lote e desempenho com 100.000 linhas (FR-021, SC-005).
 */
@TestPropertySource(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
class AuditQueryIT extends IntegrationTestBase {

  private static final Instant T0 = Instant.parse("2026-10-01T12:00:00Z");
  private static final String IP = "203.0.113.77";

  @Autowired private Pseudonymizer pseudonymizer;
  @Autowired private AuditService audit;
  @Autowired private EntityManagerFactory entityManagerFactory;

  private SeededUser adminA;
  private SeededUser adminB;
  private SeededUser ana;
  private SeededUser bia;
  private TestUser token;

  @BeforeEach
  void init() throws Exception {
    adminA = seed.createAdmin("adm.a@teste.com");
    seed.setName(adminA.id(), "Ana Administradora");
    adminB = seed.createAdmin("adm.b@teste.com");
    ana = seed.createUser("ana@teste.com");
    bia = seed.createUser("bia@teste.com");
    token = login(adminA.email());
  }

  private TestUser login(String email) throws Exception {
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    return new TestUser(
        0, email, users.login(email, TestUsers.PASSWORD).get("accessToken").asText());
  }

  // ------------------------------------------------------------------ semeadura e chamadas

  private long insert(
      Instant at, AuditAction action, AuditResult result, ActorKind kind, Long actor, Long target) {
    return insert(at, action, result, kind, actor, target, null, null, null, "{}", null);
  }

  private long insert(
      Instant at,
      AuditAction action,
      AuditResult result,
      ActorKind kind,
      Long actor,
      Long target,
      String subject,
      String reason,
      String refusalCode,
      String detailsJson,
      String clientRef) {
    return jdbc.queryForObject(
        "INSERT INTO audit_log (occurred_at, action, result, actor_kind, actor_user_id,"
            + " target_user_id, subject, reason_text, refusal_code, details, client_ref)"
            + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?) RETURNING id",
        Long.class,
        Timestamp.from(at),
        action.name(),
        result.name(),
        kind.name(),
        actor,
        target,
        subject,
        reason,
        refusalCode,
        detailsJson,
        clientRef);
  }

  private long simple(Instant at) {
    return insert(
        at,
        AuditAction.USER_SUSPENDED,
        AuditResult.SUCCESS,
        ActorKind.ADMIN,
        adminA.id(),
        ana.id());
  }

  private static Map<String, String> params(String... keyValues) {
    Map<String, String> map = new LinkedHashMap<>();
    for (int i = 0; i < keyValues.length; i += 2) {
      map.put(keyValues[i], keyValues[i + 1]);
    }
    return map;
  }

  private ResultActions call(String uri, Map<String, String> params) throws Exception {
    MockHttpServletRequestBuilder request =
        get(uri).header(HttpHeaders.AUTHORIZATION, token.bearer());
    params.forEach(request::param);
    return mockMvc.perform(request);
  }

  private JsonNode body(ResultActions result) throws Exception {
    return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
  }

  private JsonNode list(Map<String, String> params) throws Exception {
    return body(
        call("/admin/audit", params).andExpect(status().isOk()).andExpect(matchesContract()));
  }

  private JsonNode detail(long id) throws Exception {
    return body(
        call("/admin/audit/" + id, Map.of())
            .andExpect(status().isOk())
            .andExpect(matchesContract()));
  }

  private static List<Long> ids(JsonNode page) {
    List<Long> ids = new ArrayList<>();
    page.get("content").forEach(row -> ids.add(row.get("id").asLong()));
    return ids;
  }

  /** Percorre todas as páginas de {@code limit} em {@code limit}; devolve os ids na ordem vista. */
  private List<Long> walk(Map<String, String> base, int limit) throws Exception {
    List<Long> seen = new ArrayList<>();
    String cursor = null;
    do {
      Map<String, String> params = new LinkedHashMap<>(base);
      params.put("limit", Integer.toString(limit));
      if (cursor != null) {
        params.put("cursor", cursor);
      }
      JsonNode page = list(params);
      assertThat(page.get("content").size()).isLessThanOrEqualTo(limit);
      seen.addAll(ids(page));
      cursor = page.has("nextCursor") ? page.get("nextCursor").asText() : null;
    } while (cursor != null);
    return seen;
  }

  private List<Long> expectedOrder() {
    return jdbc.queryForList(
        "SELECT id FROM audit_log ORDER BY occurred_at DESC, id DESC", Long.class);
  }

  // ------------------------------------------------------------------ ordem e paginação

  @Test
  void semFiltroDevolve50DoMaisRecenteParaOMaisAntigoEPaginaAteOFim() throws Exception {
    List<Long> inserted = new ArrayList<>();
    for (int i = 0; i < 60; i++) {
      inserted.add(simple(T0.plus(Duration.ofMinutes(i))));
    }

    JsonNode first = list(params());

    assertThat(first.get("content")).hasSize(50);
    assertThat(first.get("nextCursor").asText()).isNotBlank();
    assertThat(ids(first).get(0)).isEqualTo(inserted.get(59));
    JsonNode second = list(params("cursor", first.get("nextCursor").asText()));
    assertThat(second.get("content")).hasSize(10);
    assertThat(second.has("nextCursor")).isFalse();
    List<Long> all = ids(first);
    all.addAll(ids(second));
    assertThat(all).containsExactlyElementsOf(expectedOrder());
  }

  @Test
  void ultimaPaginaExatamenteCheiaNaoTemNextCursor() throws Exception {
    for (int i = 0; i < 6; i++) {
      simple(T0.plus(Duration.ofMinutes(i)));
    }

    assertThat(list(params("limit", "6")).has("nextCursor")).isFalse();
    assertThat(list(params("limit", "5")).has("nextCursor")).isTrue();
  }

  @Test
  void limitVaiDe1A100EForaDisso422NoCampoLimit() throws Exception {
    for (int i = 0; i < 120; i++) {
      simple(T0.plus(Duration.ofMinutes(i)));
    }

    assertThat(list(params("limit", "100")).get("content")).hasSize(100);
    assertThat(list(params("limit", "1")).get("content")).hasSize(1);
    for (String invalid : List.of("0", "101", "-1")) {
      call("/admin/audit", params("limit", invalid))
          .andExpect(status().isUnprocessableEntity())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
          .andExpect(jsonPath("$.errors[0].field").value("limit"))
          .andExpect(responseMatchesContract());
    }
    call("/admin/audit", params("limit", "abc")).andExpect(status().isBadRequest());
  }

  @Test
  void linhasComOMesmoInstanteNaoPulamNemRepetemNoCursor() throws Exception {
    simple(T0.minus(Duration.ofMinutes(5)));
    simple(T0.minus(Duration.ofMinutes(4)));
    for (int i = 0; i < 7; i++) {
      simple(T0);
    }
    simple(T0.plus(Duration.ofMinutes(4)));
    simple(T0.plus(Duration.ofMinutes(5)));

    for (int limit : List.of(1, 2, 3, 4, 7)) {
      List<Long> walked = walk(params(), limit);

      assertThat(walked).as("limit %s", limit).containsExactlyElementsOf(expectedOrder());
    }
  }

  @Test
  void insercoesEntreAPagina1EA2NaoDuplicamNemPerdemAsJaExistentes() throws Exception {
    List<Long> original = new ArrayList<>();
    for (int i = 0; i < 10; i++) {
      original.add(simple(T0.plus(Duration.ofMinutes(i))));
    }
    JsonNode first = list(params("limit", "4"));
    List<Long> afterCursor = expectedOrder().subList(4, 10);
    // Mais recente que o cursor: fica à frente de quem já passou e nunca repete.
    long ahead = simple(T0.plus(Duration.ofHours(5)));
    // Mesmo instante do cursor, com id maior: também à frente na ordem decrescente.
    JsonNode lastOfFirst = first.get("content").get(3);
    long sameInstantNewerId =
        insert(
            Instant.parse(lastOfFirst.get("occurredAt").asText()),
            AuditAction.USER_SUSPENDED,
            AuditResult.SUCCESS,
            ActorKind.ADMIN,
            adminA.id(),
            ana.id());
    // Mais antiga que o cursor: ainda não foi percorrida e aparece no seu lugar.
    long behind = simple(T0.minus(Duration.ofHours(1)));

    List<Long> seen = new ArrayList<>(ids(first));
    String cursor = first.get("nextCursor").asText();
    while (cursor != null) {
      JsonNode page = list(params("limit", "4", "cursor", cursor));
      seen.addAll(ids(page));
      cursor = page.has("nextCursor") ? page.get("nextCursor").asText() : null;
    }

    assertThat(seen).doesNotHaveDuplicates();
    assertThat(seen).containsAll(original);
    assertThat(seen.subList(4, seen.size()))
        .doesNotContain(ahead, sameInstantNewerId)
        .contains(behind);
    assertThat(seen.subList(4, seen.size()).subList(0, 6)).containsExactlyElementsOf(afterCursor);
  }

  /**
   * Limite documentado: o instante da linha vem do relógio da aplicação (A8), não do commit. Uma
   * linha com instante antigo que só confirma depois de o leitor passar daquele ponto não aparece
   * para ele nas páginas seguintes (só numa leitura nova). O teste fixa esse comportamento.
   */
  @Test
  void linhaComInstanteJaPercorridoQueSoConfirmaDepoisNaoApareceParaQuemPassou() throws Exception {
    for (int i = 0; i < 6; i++) {
      simple(T0.plus(Duration.ofMinutes(i)));
    }
    JsonNode first = list(params("limit", "3"));
    long late = simple(T0.plus(Duration.ofMinutes(5)).plusSeconds(30));

    List<Long> rest = new ArrayList<>(ids(list(params("limit", "3", "cursor", cursor(first)))));

    assertThat(rest).doesNotContain(late);
    assertThat(ids(list(params("limit", "10")))).contains(late);
  }

  private static String cursor(JsonNode page) {
    return page.get("nextCursor").asText();
  }

  @Test
  void leituraEmParaleloComEscritaNaoDuplicaNemPerdeNenhumaLinhaOriginal() throws Exception {
    List<Long> original = new ArrayList<>();
    for (int i = 0; i < 300; i++) {
      original.add(simple(T0.plus(Duration.ofSeconds(i * 7L))));
    }
    ExecutorService pool = Executors.newSingleThreadExecutor();
    AtomicBoolean stop = new AtomicBoolean();
    try {
      Future<Integer> writer =
          pool.submit(
              () -> {
                int written = 0;
                while (!stop.get() && written < 400) {
                  simple(T0.plus(Duration.ofDays(1)).plusSeconds(written));
                  written++;
                }
                return written;
              });

      List<Long> walked = walk(params(), 10);
      stop.set(true);
      int written = writer.get(30, TimeUnit.SECONDS);

      assertThat(written).isPositive();
      assertThat(walked).doesNotHaveDuplicates().containsAll(original);
      Set<Long> originalIds = new HashSet<>(original);
      List<Long> onlyOriginal = walked.stream().filter(originalIds::contains).toList();
      List<Long> expected = new ArrayList<>(original);
      Collections.reverse(expected);
      assertThat(onlyOriginal).containsExactlyElementsOf(expected);
    } finally {
      stop.set(true);
      pool.shutdownNow();
    }
  }

  // ------------------------------------------------------------------ filtros

  /** Cinco linhas, uma por hora a partir de T0. */
  private long[] fiveRows() {
    long r1 =
        insert(
            T0,
            AuditAction.USER_SUSPENDED,
            AuditResult.SUCCESS,
            ActorKind.ADMIN,
            adminA.id(),
            ana.id());
    long r2 =
        insert(
            T0.plus(Duration.ofHours(1)),
            AuditAction.USER_REACTIVATED,
            AuditResult.SUCCESS,
            ActorKind.ADMIN,
            adminA.id(),
            ana.id());
    long r3 =
        insert(
            T0.plus(Duration.ofHours(2)),
            AuditAction.USER_SUSPENDED,
            AuditResult.REFUSED,
            ActorKind.ADMIN,
            adminB.id(),
            bia.id());
    long r4 =
        insert(
            T0.plus(Duration.ofHours(3)),
            AuditAction.ACCESS_DENIED,
            AuditResult.REFUSED,
            ActorKind.VISITOR,
            null,
            null);
    long r5 =
        insert(
            T0.plus(Duration.ofHours(4)),
            AuditAction.ROLE_GRANTED,
            AuditResult.FAILED,
            ActorKind.ADMIN,
            adminB.id(),
            ana.id());
    return new long[] {r1, r2, r3, r4, r5};
  }

  @Test
  void fromEhInclusivoEToEhExclusivo() throws Exception {
    long[] r = fiveRows();
    String from = T0.plus(Duration.ofHours(1)).toString();
    String to = T0.plus(Duration.ofHours(3)).toString();

    assertThat(ids(list(params("from", from)))).containsExactly(r[4], r[3], r[2], r[1]);
    assertThat(ids(list(params("to", to)))).containsExactly(r[2], r[1], r[0]);
    assertThat(ids(list(params("from", from, "to", to)))).containsExactly(r[2], r[1]);
    assertThat(ids(list(params("from", from, "to", from)))).isEmpty();
  }

  @Test
  void aceitaDeslocamentoDeFusoNoPeriodo() throws Exception {
    long[] r = fiveRows();

    // 09:00-03:00 é 12:00Z, o instante de T0.
    assertThat(ids(list(params("from", "2026-10-01T09:00:00-03:00", "to", "2026-10-01T13:30:00Z"))))
        .containsExactly(r[1], r[0]);
  }

  @Test
  void filtraPorAutorAlvoAcaoEResultadoSozinhosECombinados() throws Exception {
    long[] r = fiveRows();

    assertThat(ids(list(params("actorId", Long.toString(adminA.id())))))
        .containsExactly(r[1], r[0]);
    assertThat(ids(list(params("targetUserId", Long.toString(ana.id())))))
        .containsExactly(r[4], r[1], r[0]);
    assertThat(ids(list(params("action", "USER_SUSPENDED")))).containsExactly(r[2], r[0]);
    assertThat(ids(list(params("result", "REFUSED")))).containsExactly(r[3], r[2]);
    assertThat(
            ids(
                list(
                    params(
                        "actorId",
                        Long.toString(adminB.id()),
                        "targetUserId",
                        Long.toString(ana.id()),
                        "result",
                        "FAILED"))))
        .containsExactly(r[4]);
    assertThat(
            ids(
                list(
                    params(
                        "action",
                        "USER_SUSPENDED",
                        "result",
                        "REFUSED",
                        "from",
                        T0.plus(Duration.ofHours(1)).toString()))))
        .containsExactly(r[2]);
    JsonNode none = list(params("actorId", Long.toString(adminA.id()), "result", "FAILED"));
    assertThat(none.get("content")).isEmpty();
    assertThat(none.has("nextCursor")).isFalse();
  }

  @Test
  void filtroEPaginacaoAndamJuntos() throws Exception {
    for (int i = 0; i < 9; i++) {
      simple(T0.plus(Duration.ofMinutes(i)));
      insert(
          T0.plus(Duration.ofMinutes(i)),
          AuditAction.ROLE_GRANTED,
          AuditResult.SUCCESS,
          ActorKind.ADMIN,
          adminB.id(),
          bia.id());
    }

    List<Long> walked = walk(params("action", "USER_SUSPENDED"), 4);

    assertThat(walked).hasSize(9);
    assertThat(walked)
        .containsExactlyElementsOf(
            jdbc.queryForList(
                "SELECT id FROM audit_log WHERE action = 'USER_SUSPENDED'"
                    + " ORDER BY occurred_at DESC, id DESC",
                Long.class));
  }

  @Test
  void fromDepoisDeTo422() throws Exception {
    call("/admin/audit", params("from", "2026-10-02T00:00:00Z", "to", "2026-10-01T00:00:00Z"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
        .andExpect(jsonPath("$.errors[0].field").value("from"))
        .andExpect(responseMatchesContract());
  }

  @Test
  void valoresForaDoContratoDao422PorCampo() throws Exception {
    List<String[]> invalid =
        List.of(
            new String[] {"action", "NAO_EXISTE"},
            new String[] {"action", "user_suspended"},
            new String[] {"result", "SUCESSO"},
            new String[] {"result", "success"},
            new String[] {"from", "ontem"},
            new String[] {"to", "2026-13-45T00:00:00Z"});
    for (String[] parameter : invalid) {
      call("/admin/audit", params(parameter[0], parameter[1]))
          .andExpect(status().isUnprocessableEntity())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
          .andExpect(jsonPath("$.errors[0].field").value(parameter[0]))
          .andExpect(responseMatchesContract());
    }
  }

  @Test
  void variosCamposInvalidosVoltamTodosNaMesmaResposta() throws Exception {
    call("/admin/audit", params("action", "X", "result", "Y", "cursor", "!!!", "limit", "0"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors.length()").value(4));
  }

  @Test
  void idsNaoNumericosDaoBadRequest() throws Exception {
    call("/admin/audit", params("actorId", "abc")).andExpect(status().isBadRequest());
    call("/admin/audit", params("targetUserId", "1.5")).andExpect(status().isBadRequest());
    call("/admin/audit/abc", Map.of()).andExpect(status().isBadRequest());
  }

  @Test
  void filtroEmBrancoNaoFiltra() throws Exception {
    fiveRows();

    // O validador de contrato recusa parâmetro vazio na requisição; só a resposta é conferida.
    JsonNode page =
        body(
            call("/admin/audit", params("action", "", "result", " ", "cursor", ""))
                .andExpect(status().isOk())
                .andExpect(responseMatchesContract()));

    assertThat(page.get("content")).hasSize(5);
  }

  // ------------------------------------------------------------------ cursor

  @Test
  void cursorInvalidoDa422NoCampoCursorENuncaVaiAoBanco() throws Exception {
    simple(T0);
    List<String> invalid =
        List.of("!!!", "abc", b64("nao-sei"), b64("-1:5"), "x".repeat(201), "MTIz\0NDU2");
    for (String cursor : invalid) {
      call("/admin/audit", params("cursor", cursor))
          .andExpect(status().isUnprocessableEntity())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
          .andExpect(jsonPath("$.errors[0].field").value("cursor"))
          .andExpect(responseMatchesContract());
    }
  }

  /** O cursor guarda só uma posição; não autoriza nada e pode ser forjado sem efeito de acesso. */
  @Test
  void cursorValidoMasForjadoSoMudaAPosicaoDaLeitura() throws Exception {
    long old = simple(T0);
    simple(T0.plus(Duration.ofHours(1)));
    String forged = new KeysetCursor(T0.plus(Duration.ofMinutes(30)), Long.MAX_VALUE).encode();

    assertThat(ids(list(params("cursor", forged)))).containsExactly(old);
  }

  // ------------------------------------------------------------------ detalhe

  @Test
  void detalheTrazMotivoDetalhesEResumoSoComChavesConhecidas() throws Exception {
    long id =
        insert(
            T0,
            AuditAction.PARAMETER_CHANGED,
            AuditResult.SUCCESS,
            ActorKind.ADMIN,
            adminA.id(),
            null,
            "SIGNUPS_OPEN",
            "Pedido registrado no chamado 12",
            null,
            "{\"from\":\"true\",\"to\":\"false\",\"parameter\":\"SIGNUPS_OPEN\","
                + "\"email\":\"vazou@x.com\",\"segredo\":\"abc\"}",
            null);

    JsonNode entry = detail(id);

    assertThat(entry.get("id").asLong()).isEqualTo(id);
    assertThat(entry.get("action").asText()).isEqualTo("PARAMETER_CHANGED");
    assertThat(entry.get("result").asText()).isEqualTo("SUCCESS");
    assertThat(entry.get("occurredAt").asText()).isEqualTo(T0.toString());
    assertThat(entry.get("reason").asText()).isEqualTo("Pedido registrado no chamado 12");
    assertThat(entry.get("subject").asText()).isEqualTo("SIGNUPS_OPEN");
    assertThat(entry.get("summary").asText()).isNotBlank();
    assertThat(entry.get("details").fieldNames())
        .toIterable()
        .containsExactlyInAnyOrder("from", "to", "parameter");
    assertThat(entry.has("target")).isFalse();
    assertThat(entry.has("client")).isFalse();
  }

  @Test
  void recusaMostraOCodigoDaRecusa() throws Exception {
    long id =
        insert(
            T0,
            AuditAction.USER_SUSPENDED,
            AuditResult.REFUSED,
            ActorKind.ADMIN,
            adminA.id(),
            ana.id(),
            null,
            null,
            "LAST_ADMIN",
            "{}",
            null);

    assertThat(detail(id).get("refusalCode").asText()).isEqualTo("LAST_ADMIN");
    assertThat(list(params()).get("content").get(0).get("refusalCode").asText())
        .isEqualTo("LAST_ADMIN");
  }

  @Test
  void idInexistenteDa404SemGravarAuditoria() throws Exception {
    simple(T0);
    long before = jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class);

    call("/admin/audit/987654", Map.of())
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"))
        .andExpect(responseMatchesContract());
    call("/admin/audit/0", Map.of()).andExpect(status().isNotFound());
    call("/admin/audit/-3", Map.of()).andExpect(status().isNotFound());

    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class)).isEqualTo(before);
  }

  @Test
  void lerAListaOuODetalheNaoGravaNada() throws Exception {
    long id = simple(T0);
    long before = jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class);

    list(params());
    detail(id);

    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class)).isEqualTo(before);
  }

  // ------------------------------------------------------------------ rótulos

  @Test
  void rotulosVemDeUsersEContaRemovidaViraAnonimoComOMesmoRotuloDeSempre() throws Exception {
    long ghost = 987654L;
    long byAdmin =
        insert(
            T0,
            AuditAction.USER_SUSPENDED,
            AuditResult.SUCCESS,
            ActorKind.ADMIN,
            adminA.id(),
            ana.id());
    long byUnnamed =
        insert(
            T0.plusSeconds(1),
            AuditAction.USER_SUSPENDED,
            AuditResult.SUCCESS,
            ActorKind.ADMIN,
            adminB.id(),
            ghost);
    long byGhost =
        insert(
            T0.plusSeconds(2),
            AuditAction.ROLE_GRANTED,
            AuditResult.SUCCESS,
            ActorKind.ADMIN,
            ghost,
            ana.id());
    long byVisitor =
        insert(
            T0.plusSeconds(3),
            AuditAction.ACCESS_DENIED,
            AuditResult.REFUSED,
            ActorKind.VISITOR,
            null,
            null);
    long bySystem =
        insert(
            T0.plusSeconds(4),
            AuditAction.SYSTEM_SESSIONS_REVOKED,
            AuditResult.SUCCESS,
            ActorKind.SYSTEM,
            null,
            ana.id());

    Map<Long, JsonNode> rows = new LinkedHashMap<>();
    list(params()).get("content").forEach(row -> rows.put(row.get("id").asLong(), row));

    assertThat(rows.get(byAdmin).get("actor").get("label").asText())
        .isEqualTo("Ana Administradora");
    assertThat(rows.get(byAdmin).get("actor").get("userId").asLong()).isEqualTo(adminA.id());
    assertThat(rows.get(byAdmin).get("target").get("label").asText()).isEqualTo("ana@teste.com");
    assertThat(rows.get(byUnnamed).get("actor").get("label").asText()).isEqualTo("adm.b@teste.com");
    String anonymous = pseudonymizer.anonymousLabel(ghost);
    assertThat(anonymous).matches("anônimo-[0-9a-f]{8}");
    assertThat(rows.get(byUnnamed).get("target").get("label").asText()).isEqualTo(anonymous);
    assertThat(rows.get(byGhost).get("actor").get("label").asText()).isEqualTo(anonymous);
    assertThat(rows.get(byVisitor).get("actor").get("label").asText()).isEqualTo("visitante");
    assertThat(rows.get(byVisitor).get("actor").has("userId")).isFalse();
    assertThat(rows.get(bySystem).get("actor").get("label").asText()).isEqualTo("sistema");
    assertThat(detail(byGhost).get("actor").get("label").asText()).isEqualTo(anonymous);
  }

  @Test
  void rotulosSaoResolvidosEmLoteSemConsultaPorLinha() throws Exception {
    List<SeededUser> actors = new ArrayList<>();
    for (int i = 0; i < 20; i++) {
      actors.add(seed.createAdmin("adm" + i + "@lote.com"));
    }
    for (int i = 0; i < 40; i++) {
      insert(
          T0.plusSeconds(i),
          AuditAction.USER_SUSPENDED,
          AuditResult.SUCCESS,
          ActorKind.ADMIN,
          actors.get(i % 20).id(),
          actors.get((i + 1) % 20).id());
    }
    Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();

    statistics.clear();
    JsonNode small = list(params("limit", "2"));
    long smallStatements = statistics.getPrepareStatementCount();
    statistics.clear();
    JsonNode large = list(params("limit", "40"));
    long largeStatements = statistics.getPrepareStatementCount();

    assertThat(small.get("content")).hasSize(2);
    assertThat(large.get("content")).hasSize(40);
    assertThat(largeStatements).isEqualTo(smallStatements);
    assertThat(largeStatements).isLessThanOrEqualTo(4);
  }

  // ------------------------------------------------------------------ IP e dispositivo

  private long attempt(RequestOrigin origin, ActorKind kind, Long actor, Long target) {
    AuditEntry entry =
        AuditEntry.builder(AuditAction.REVERT_ATTEMPT)
            .actor(kind, actor)
            .target(target)
            .refusal("ACCOUNT_SUSPENDED")
            .build();
    assertThat(audit.recordAttempt(entry, origin, target == null ? null : target.toString()))
        .isTrue();
    return jdbc.queryForObject("SELECT max(id) FROM audit_log", Long.class);
  }

  @Test
  void listaNuncaTrazOIpEODetalheTrazIpDispositivoERefDaTentativa() throws Exception {
    RequestOrigin origin = new RequestOrigin(IP, "Firefox em Linux", "WEB");
    long id = attempt(origin, ActorKind.USER, ana.id(), ana.id());
    simple(T0);

    ResultActions listResult = call("/admin/audit", params()).andExpect(status().isOk());
    String listBody = listResult.andReturn().getResponse().getContentAsString();
    assertThat(listBody).doesNotContain(IP).doesNotContain("Firefox").doesNotContain("\"client\"");
    list(params());

    JsonNode entry = detail(id);
    JsonNode client = entry.get("client");
    assertThat(client.get("ip").asText()).isEqualTo(IP);
    assertThat(client.get("device").asText()).isEqualTo("Firefox em Linux");
    assertThat(client.get("ref").asText())
        .matches("anônimo-[0-9a-f]{8}")
        .isEqualTo("anônimo-" + pseudonymizer.ipRef(IP).substring(0, 8));
    assertThat(client.get("ref").asText()).doesNotContain(pseudonymizer.ipRef(IP));
    assertThat(entry.get("actor").get("label").asText()).isEqualTo("ana@teste.com");
  }

  @Test
  void depoisQueOIpSaiDaTabelaODetalheMantemSoARefCorrelacionavel() throws Exception {
    RequestOrigin origin = new RequestOrigin(IP, "Firefox em Linux", "WEB");
    long id = attempt(origin, ActorKind.VISITOR, null, ana.id());
    String before = detail(id).get("client").get("ref").asText();

    jdbc.update("DELETE FROM audit_log_client WHERE audit_id = ?", id);

    JsonNode client = detail(id).get("client");
    assertThat(client.get("ref").asText()).isEqualTo(before);
    assertThat(client.has("ip")).isFalse();
    assertThat(client.has("device")).isFalse();
  }

  @Test
  void linhaSemOrigemNaoTemClientNoDetalhe() throws Exception {
    long id = simple(T0);

    assertThat(detail(id).has("client")).isFalse();
  }

  @Test
  void historicoDoUsuarioContinuaSemIpNemClient() throws Exception {
    RequestOrigin origin = new RequestOrigin(IP, "Firefox em Linux", "WEB");
    attempt(origin, ActorKind.USER, ana.id(), ana.id());

    String body =
        call("/admin/users/" + ana.id(), Map.of())
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();

    assertThat(body).contains("recentActions");
    assertThat(body).doesNotContain(IP).doesNotContain("Firefox").doesNotContain("\"client\"");
  }

  // ------------------------------------------------------------------ desempenho (SC-005)

  private long millis(Supplier<?> request) {
    long start = System.nanoTime();
    request.get();
    return Duration.ofNanos(System.nanoTime() - start).toMillis();
  }

  private long median(Map<String, String> params) throws Exception {
    list(params);
    List<Long> millis = new ArrayList<>();
    for (int i = 0; i < 7; i++) {
      millis.add(
          millis(
              () -> {
                try {
                  return list(params);
                } catch (Exception e) {
                  throw new IllegalStateException(e);
                }
              }));
    }
    Collections.sort(millis);
    System.out.println("AUDIT-PERF " + params + " medianaMs=" + millis.get(3) + " " + millis);
    return millis.get(millis.size() / 2);
  }

  /**
   * Com 100.000 linhas, a primeira página, uma página profunda (cursor perto do fim) e as páginas
   * filtradas respondem em menos de 300 ms (mediana de 7 execuções depois de uma de aquecimento).
   */
  @Test
  void comCemMilLinhasAPrimeiraPaginaEUmaProfundaRespondemEmMenosDe300Ms() throws Exception {
    jdbc.update(
        "INSERT INTO audit_log (occurred_at, action, result, actor_kind, actor_user_id,"
            + " target_user_id, details)"
            + " SELECT TIMESTAMPTZ '2026-10-01 12:00:00+00' - g * interval '1 minute',"
            + " (ARRAY['USER_SUSPENDED','USER_REACTIVATED','ROLE_GRANTED','ACCESS_DENIED',"
            + "'SESSION_REVOKED'])[1 + g % 5],"
            + " CASE WHEN g % 2000 = 0 THEN 'FAILED' WHEN g % 10 = 0 THEN 'REFUSED'"
            + " ELSE 'SUCCESS' END,"
            + " 'ADMIN', 1 + g % 50, 1 + g % 5000, '{}'::jsonb"
            + " FROM generate_series(1, 100000) g");
    jdbc.execute("ANALYZE audit_log");
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class))
        .isEqualTo(100000L);
    Map<String, Object> deep =
        jdbc.queryForMap(
            "SELECT occurred_at, id FROM audit_log ORDER BY occurred_at DESC, id DESC"
                + " OFFSET 99900 LIMIT 1");
    String deepCursor =
        new KeysetCursor(
                ((java.sql.Timestamp) deep.get("occurred_at")).toInstant(),
                ((Number) deep.get("id")).longValue())
            .encode();

    assertThat(median(params())).as("primeira página").isLessThan(300);
    assertThat(median(params("cursor", deepCursor))).as("página profunda").isLessThan(300);
    assertThat(list(params("cursor", deepCursor)).get("content")).hasSize(50);
    assertThat(median(params("result", "FAILED"))).as("filtro por resultado raro").isLessThan(300);
    assertThat(median(params("result", "REFUSED", "cursor", deepCursor)))
        .as("resultado e página profunda")
        .isLessThan(300);
    assertThat(median(params("actorId", "7"))).as("filtro por autor").isLessThan(300);
    assertThat(median(params("targetUserId", "123"))).as("filtro por alvo").isLessThan(300);
    assertThat(median(params("action", "ROLE_GRANTED"))).as("filtro por ação").isLessThan(300);
    assertThat(
            median(
                params(
                    "from",
                    "2026-09-20T00:00:00Z",
                    "to",
                    "2026-09-21T00:00:00Z",
                    "cursor",
                    deepCursor)))
        .as("período")
        .isLessThan(300);
  }

  private static String b64(String payload) {
    return java.util.Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8));
  }
}
