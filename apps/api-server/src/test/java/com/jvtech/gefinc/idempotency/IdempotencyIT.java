package com.jvtech.gefinc.idempotency;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/** Operações do modo offline do app são registradas exatamente uma vez, mesmo se repetidas. */
class IdempotencyIT extends IntegrationTestBase {

  @Autowired private IdempotencyCleanupJob cleanupJob;

  private TestApi api;
  private TestUser ana;
  private long checking;
  private long food;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    checking = api.checking(ana, "Itaú");
    food = api.category(ana, "Alimentação");
  }

  private Map<String, Object> mercado(String amount) {
    return api.variableBody("Mercado", amount, checking, food, "2026-11-08", "2026-11-15");
  }

  private ResultActions post(TestUser user, String path, String key, Object body) throws Exception {
    return send(HttpMethod.POST, user, path, key, body);
  }

  private ResultActions send(HttpMethod method, TestUser user, String path, String key, Object body)
      throws Exception {
    MockHttpServletRequestBuilder builder =
        MockMvcRequestBuilders.request(method, path)
            .header(HttpHeaders.AUTHORIZATION, user.bearer());
    if (key != null) {
      builder.header("Idempotency-Key", key);
    }
    if (body != null) {
      builder
          .contentType(MediaType.APPLICATION_JSON)
          .content(objectMapper.writeValueAsString(body));
    }
    return mockMvc.perform(builder);
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  @Test
  void repetirACriacaoDevolveARespostaOriginalSemDuplicar() throws Exception {
    String key = UUID.randomUUID().toString();

    String first =
        post(ana, "/transaction-groups", key, mercado("150.00"))
            .andExpect(status().isCreated())
            .andExpect(matchesContract())
            .andExpect(header().doesNotExist("Idempotent-Replayed"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String second =
        post(ana, "/transaction-groups", key, mercado("150.00"))
            .andExpect(status().isCreated())
            .andExpect(matchesContract())
            .andExpect(header().string("Idempotent-Replayed", "true"))
            .andReturn()
            .getResponse()
            .getContentAsString();

    assertThat(objectMapper.readTree(second)).isEqualTo(objectMapper.readTree(first));
    assertThat(count("transaction_groups")).isEqualTo(1);
    assertThat(count("transactions")).isEqualTo(1);
  }

  @Test
  void repetirOPagamentoNaoViraConflitoNemPagaDeNovo() throws Exception {
    long id = api.createGroup(ana, mercado("150.00")).get("transactions").get(0).get("id").asLong();
    String key = UUID.randomUUID().toString();
    Map<String, Object> body = Map.of("paymentDate", "2026-11-09");

    post(ana, "/transactions/" + id + "/pay", key, body)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("PAID"));
    post(ana, "/transactions/" + id + "/pay", key, body)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(header().string("Idempotent-Replayed", "true"))
        .andExpect(jsonPath("$.status").value("PAID"));
  }

  @Test
  void repetirODesfazerNaoViraConflito() throws Exception {
    long id = api.createGroup(ana, mercado("150.00")).get("transactions").get(0).get("id").asLong();
    post(ana, "/transactions/" + id + "/pay", null, Map.of("paymentDate", "2026-11-09"))
        .andExpect(status().isOk());
    String key = UUID.randomUUID().toString();

    post(ana, "/transactions/" + id + "/unpay", key, null).andExpect(status().isOk());
    post(ana, "/transactions/" + id + "/unpay", key, null)
        .andExpect(status().isOk())
        .andExpect(header().string("Idempotent-Replayed", "true"))
        .andExpect(jsonPath("$.status").value("PENDING"));
  }

  @Test
  void respostasDeErroTambemSaoRepetidasComAMesmaChave() throws Exception {
    long id = api.createGroup(ana, mercado("150.00")).get("transactions").get(0).get("id").asLong();
    post(ana, "/transactions/" + id + "/pay", null, Map.of("paymentDate", "2026-11-09"))
        .andExpect(status().isOk());
    String key = UUID.randomUUID().toString();
    Map<String, Object> body = Map.of("paymentDate", "2026-11-10");

    post(ana, "/transactions/" + id + "/pay", key, body).andExpect(status().isConflict());
    post(ana, "/transactions/" + id + "/pay", key, body)
        .andExpect(status().isConflict())
        .andExpect(header().string("Idempotent-Replayed", "true"));
  }

  @Test
  void mesmaChaveComOutroCorpoOuOutroCaminhoERecusada() throws Exception {
    String key = UUID.randomUUID().toString();
    post(ana, "/transaction-groups", key, mercado("150.00")).andExpect(status().isCreated());

    post(ana, "/transaction-groups", key, mercado("151.00"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));

    long id = api.createGroup(ana, mercado("20.00")).get("transactions").get(0).get("id").asLong();
    post(ana, "/transactions/" + id + "/pay", key, Map.of("paymentDate", "2026-11-09"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
    assertThat(count("transaction_groups")).isEqualTo(2);
  }

  @Test
  void chaveEmProcessamentoResponde409() throws Exception {
    String key = UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO idempotency_keys (user_id, key, method, path, request_hash, state, created_at)"
            + " VALUES (?, ?::uuid, 'POST', '/transaction-groups', ?, 'IN_PROGRESS', ?)",
        ana.id(),
        key,
        IdempotencyService.hash(objectMapper.writeValueAsBytes(mercado("150.00"))),
        java.sql.Timestamp.from(clock.instant()));

    post(ana, "/transaction-groups", key, mercado("150.00"))
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("IDEMPOTENCY_IN_PROGRESS"));
    assertThat(count("transaction_groups")).isZero();
  }

  @Test
  void requisicoesSimultaneasComAMesmaChaveCriamUmaSoVez() throws Exception {
    String key = UUID.randomUUID().toString();
    int threads = 6;
    CountDownLatch start = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    List<Future<Integer>> results = new ArrayList<>();
    for (int i = 0; i < threads; i++) {
      Callable<Integer> call =
          () -> {
            start.await();
            return post(ana, "/transaction-groups", key, mercado("150.00"))
                .andReturn()
                .getResponse()
                .getStatus();
          };
      results.add(pool.submit(call));
    }
    start.countDown();
    List<Integer> statuses = new ArrayList<>();
    for (Future<Integer> result : results) {
      statuses.add(result.get());
    }
    pool.shutdown();

    assertThat(statuses).contains(201).allMatch(s -> s == 201 || s == 409);
    assertThat(count("transaction_groups")).isEqualTo(1);
  }

  @Test
  void chavesSaoIsoladasPorUsuario() throws Exception {
    TestUser bruno = new TestUsers(mockMvc, objectMapper).registerAndLogin("bruno@example.com");
    long brunoChecking = api.checking(bruno, "Nubank");
    long brunoFood = api.category(bruno, "Alimentação");
    String key = UUID.randomUUID().toString();

    post(ana, "/transaction-groups", key, mercado("150.00")).andExpect(status().isCreated());
    JsonNode brunos =
        objectMapper.readTree(
            post(
                    bruno,
                    "/transaction-groups",
                    key,
                    api.variableBody(
                        "Padaria", "9.00", brunoChecking, brunoFood, "2026-11-08", "2026-11-15"))
                .andExpect(status().isCreated())
                .andExpect(header().doesNotExist("Idempotent-Replayed"))
                .andReturn()
                .getResponse()
                .getContentAsString());

    assertThat(brunos.get("description").asText()).isEqualTo("Padaria");
    assertThat(count("transaction_groups")).isEqualTo(2);
    assertThat(count("idempotency_keys")).isEqualTo(2);
  }

  @Test
  void semCabecalhoOComportamentoNaoMuda() throws Exception {
    post(ana, "/transaction-groups", null, mercado("150.00")).andExpect(status().isCreated());
    post(ana, "/transaction-groups", null, mercado("150.00")).andExpect(status().isCreated());

    assertThat(count("transaction_groups")).isEqualTo(2);
    assertThat(count("idempotency_keys")).isZero();
  }

  @Test
  void chaveQueNaoEUuidERecusada() throws Exception {
    post(ana, "/transaction-groups", "nao-e-uuid", mercado("150.00"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    assertThat(count("transaction_groups")).isZero();
  }

  @Test
  void limpezaApagaChavesComMaisDeSeteDias() throws Exception {
    String old = UUID.randomUUID().toString();
    String recent = UUID.randomUUID().toString();
    post(ana, "/transaction-groups", old, mercado("10.00")).andExpect(status().isCreated());
    clock.advance(Duration.ofDays(8));
    // o token de acesso expira em 15 minutos: entra de novo depois de avançar o relógio
    ana =
        new TestUser(
            ana.id(),
            ana.email(),
            new TestUsers(mockMvc, objectMapper)
                .login("ana@example.com", "senha-forte-123")
                .get("accessToken")
                .asText());
    post(ana, "/transaction-groups", recent, mercado("11.00")).andExpect(status().isCreated());

    int removed = cleanupJob.purgeExpired();

    assertThat(removed).isEqualTo(1);
    assertThat(jdbc.queryForList("SELECT key::text FROM idempotency_keys", String.class))
        .containsExactly(recent);
  }

  @Test
  void excluirOUsuarioApagaSuasChaves() throws Exception {
    post(ana, "/transaction-groups", UUID.randomUUID().toString(), mercado("10.00"))
        .andExpect(status().isCreated());
    assertThat(count("idempotency_keys")).isEqualTo(1);

    jdbc.update("DELETE FROM users WHERE id = ?", ana.id());

    assertThat(count("idempotency_keys")).isZero();
  }

  private Map<String, Object> patchBody(JsonNode tx, String amount) {
    return Map.of("amount", amount, "version", tx.get("version").asLong());
  }

  private JsonNode firstTransaction(TestUser user, Map<String, Object> body) throws Exception {
    return api.createGroup(user, body).get("transactions").get(0);
  }

  @Test
  void reenviarOPatchJaAplicadoDevolveARespostaOriginalSemConflitoFalsoDeVersao() throws Exception {
    JsonNode tx = firstTransaction(ana, mercado("150.00"));
    long id = tx.get("id").asLong();
    String key = UUID.randomUUID().toString();
    Map<String, Object> body = patchBody(tx, "175.50");

    String first =
        send(HttpMethod.PATCH, ana, "/transactions/" + id, key, body)
            .andExpect(status().isOk())
            .andExpect(matchesContract())
            .andExpect(header().doesNotExist("Idempotent-Replayed"))
            .andExpect(jsonPath("$.amount").value("175.50"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    // resposta perdida: o app reenvia a mesma operação, ainda com a versão antiga
    String second =
        send(HttpMethod.PATCH, ana, "/transactions/" + id, key, body)
            .andExpect(status().isOk())
            .andExpect(matchesContract())
            .andExpect(header().string("Idempotent-Replayed", "true"))
            .andReturn()
            .getResponse()
            .getContentAsString();

    assertThat(objectMapper.readTree(second)).isEqualTo(objectMapper.readTree(first));
    assertThat(api.get(ana, "/transactions/" + id).get("version").asLong())
        .isEqualTo(tx.get("version").asLong() + 1);
    // sem a chave, o mesmo reenvio é um conflito de versão
    send(HttpMethod.PATCH, ana, "/transactions/" + id, null, body)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("STALE_VERSION"));
  }

  @Test
  void reenviarOPutDoGrupoDevolveARespostaOriginal() throws Exception {
    JsonNode created = api.createGroup(ana, mercado("150.00"));
    long id = created.get("id").asLong();
    Map<String, Object> body =
        Map.of(
            "description", "Supermercado", "categoryId", food, "version", created.get("version"));
    String key = UUID.randomUUID().toString();

    send(HttpMethod.PUT, ana, "/transaction-groups/" + id, key, body)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.description").value("Supermercado"));
    send(HttpMethod.PUT, ana, "/transaction-groups/" + id, key, body)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(header().string("Idempotent-Replayed", "true"))
        .andExpect(jsonPath("$.description").value("Supermercado"));
    send(HttpMethod.PUT, ana, "/transaction-groups/" + id, null, body)
        .andExpect(status().isConflict());
  }

  @Test
  void reenviarAExclusaoDoGrupoDevolve204EmVezDe404() throws Exception {
    long id = api.createGroup(ana, mercado("150.00")).get("id").asLong();
    String key = UUID.randomUUID().toString();
    String url = "/transaction-groups/" + id + "?confirm=true";

    send(HttpMethod.DELETE, ana, url, key, null)
        .andExpect(status().isNoContent())
        .andExpect(header().doesNotExist("Idempotent-Replayed"));
    send(HttpMethod.DELETE, ana, url, key, null)
        .andExpect(status().isNoContent())
        .andExpect(header().string("Idempotent-Replayed", "true"));

    assertThat(count("transaction_groups")).isZero();
    // sem a chave, o mesmo reenvio é um 404
    send(HttpMethod.DELETE, ana, url, null, null).andExpect(status().isNotFound());
  }

  @Test
  void reenviarMudancaDeValorEEncerramentoDevolveARespostaOriginal() throws Exception {
    long id =
        api.createGroup(
                ana, api.fixedBody("Aluguel", "99.90", checking, food, "2026-11-01", "2026-11-05"))
            .get("id")
            .asLong();
    String amountKey = UUID.randomUUID().toString();
    Map<String, Object> amountBody = Map.of("fromMonth", "2027-02", "amount", "120.00");
    String endKey = UUID.randomUUID().toString();
    Map<String, Object> endBody = Map.of("endMonth", "2027-04");

    post(ana, "/transaction-groups/" + id + "/amount-changes", amountKey, amountBody)
        .andExpect(status().isOk());
    post(ana, "/transaction-groups/" + id + "/amount-changes", amountKey, amountBody)
        .andExpect(status().isOk())
        .andExpect(header().string("Idempotent-Replayed", "true"));
    post(ana, "/transaction-groups/" + id + "/end", endKey, endBody).andExpect(status().isOk());
    post(ana, "/transaction-groups/" + id + "/end", endKey, endBody)
        .andExpect(status().isOk())
        .andExpect(header().string("Idempotent-Replayed", "true"));
    assertThat(count("idempotency_keys")).isEqualTo(2);
  }

  @Test
  void chaveReutilizadaComOutroCorpoOutroCaminhoOuOutroVerboERecusada() throws Exception {
    JsonNode tx = firstTransaction(ana, mercado("150.00"));
    long id = tx.get("id").asLong();
    long other = firstTransaction(ana, mercado("20.00")).get("id").asLong();
    String key = UUID.randomUUID().toString();
    send(HttpMethod.PATCH, ana, "/transactions/" + id, key, patchBody(tx, "160.00"))
        .andExpect(status().isOk());

    send(HttpMethod.PATCH, ana, "/transactions/" + id, key, patchBody(tx, "161.00"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
    send(HttpMethod.PATCH, ana, "/transactions/" + other, key, patchBody(tx, "160.00"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
    assertThat(api.get(ana, "/transactions/" + id).get("amount").asText()).isEqualTo("160.00");
  }

  @Test
  void chaveReutilizadaEmOutroVerboNoMesmoCaminhoERecusada() throws Exception {
    long id = api.createGroup(ana, mercado("150.00")).get("id").asLong();
    String key = UUID.randomUUID().toString();
    send(HttpMethod.DELETE, ana, "/transaction-groups/" + id + "?confirm=true", key, null)
        .andExpect(status().isNoContent());

    // mesmo caminho e mesmo corpo (vazio), só o verbo muda: é outra operação, não uma repetição
    send(HttpMethod.PUT, ana, "/transaction-groups/" + id, key, null)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
  }

  @Test
  void chaveDeEdicaoEmProcessamentoResponde409SemAlterarNada() throws Exception {
    JsonNode tx = firstTransaction(ana, mercado("150.00"));
    long id = tx.get("id").asLong();
    Map<String, Object> body = patchBody(tx, "175.50");
    String key = UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO idempotency_keys (user_id, key, method, path, request_hash, state, created_at)"
            + " VALUES (?, ?::uuid, 'PATCH', ?, ?, 'IN_PROGRESS', ?)",
        ana.id(),
        key,
        "/transactions/" + id,
        IdempotencyService.hash(objectMapper.writeValueAsBytes(body)),
        java.sql.Timestamp.from(clock.instant()));

    send(HttpMethod.PATCH, ana, "/transactions/" + id, key, body)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("IDEMPOTENCY_IN_PROGRESS"));
    assertThat(api.get(ana, "/transactions/" + id).get("amount").asText()).isEqualTo("150.00");
  }

  @Test
  void edicoesSimultaneasComAMesmaChaveAplicamUmaSoVez() throws Exception {
    JsonNode tx = firstTransaction(ana, mercado("150.00"));
    long id = tx.get("id").asLong();
    Map<String, Object> body = patchBody(tx, "175.50");
    String key = UUID.randomUUID().toString();
    int threads = 6;
    CountDownLatch start = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    List<Future<Integer>> results = new ArrayList<>();
    for (int i = 0; i < threads; i++) {
      Callable<Integer> call =
          () -> {
            start.await();
            return send(HttpMethod.PATCH, ana, "/transactions/" + id, key, body)
                .andReturn()
                .getResponse()
                .getStatus();
          };
      results.add(pool.submit(call));
    }
    start.countDown();
    List<Integer> statuses = new ArrayList<>();
    for (Future<Integer> result : results) {
      statuses.add(result.get());
    }
    pool.shutdown();

    assertThat(statuses).contains(200).allMatch(s -> s == 200 || s == 409);
    assertThat(api.get(ana, "/transactions/" + id).get("version").asLong())
        .isEqualTo(tx.get("version").asLong() + 1);
  }

  @Test
  void chavesDeEdicaoSaoIsoladasPorUsuario() throws Exception {
    TestUser bruno = new TestUsers(mockMvc, objectMapper).registerAndLogin("bruno@example.com");
    long brunoChecking = api.checking(bruno, "Nubank");
    long brunoFood = api.category(bruno, "Alimentação");
    JsonNode anas = firstTransaction(ana, mercado("150.00"));
    JsonNode brunos =
        firstTransaction(
            bruno,
            api.variableBody(
                "Padaria", "9.00", brunoChecking, brunoFood, "2026-11-08", "2026-11-15"));
    String key = UUID.randomUUID().toString();

    send(
            HttpMethod.PATCH,
            ana,
            "/transactions/" + anas.get("id").asLong(),
            key,
            patchBody(anas, "160.00"))
        .andExpect(status().isOk());
    send(
            HttpMethod.PATCH,
            bruno,
            "/transactions/" + brunos.get("id").asLong(),
            key,
            patchBody(brunos, "10.00"))
        .andExpect(status().isOk())
        .andExpect(header().doesNotExist("Idempotent-Replayed"))
        .andExpect(jsonPath("$.amount").value("10.00"));
    // a chave de Ana não dá acesso ao lançamento dela para Bruno
    send(
            HttpMethod.PATCH,
            bruno,
            "/transactions/" + anas.get("id").asLong(),
            UUID.randomUUID().toString(),
            patchBody(anas, "1.00"))
        .andExpect(status().isNotFound());
    assertThat(count("idempotency_keys")).isEqualTo(3);
  }

  @Test
  void edicaoEExclusaoSemCabecalhoNaoMudam() throws Exception {
    JsonNode tx = firstTransaction(ana, mercado("150.00"));
    long id = tx.get("id").asLong();
    send(HttpMethod.PATCH, ana, "/transactions/" + id, null, patchBody(tx, "151.00"))
        .andExpect(status().isOk());
    send(HttpMethod.PATCH, ana, "/transactions/" + id, "nao-e-uuid", patchBody(tx, "152.00"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    assertThat(count("idempotency_keys")).isZero();
  }
}
