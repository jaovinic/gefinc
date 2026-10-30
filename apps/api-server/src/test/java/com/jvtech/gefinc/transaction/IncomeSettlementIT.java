package com.jvtech.gefinc.transaction;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Receita só entra em conta (não em cartão), entra sozinha quando o vencimento é hoje ou anterior e
 * só pode ser antecipada enquanto for futura. "Hoje" nos testes é 10/11/2026 (America/Sao_Paulo).
 */
class IncomeSettlementIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long checking;
  private long cash;
  private long card;
  private long salary;
  private long food;

  /** O token de acesso expira com o relógio: depois de avançá-lo, entra de novo. */
  private TestUser relogin() throws Exception {
    return new TestUser(
        ana.id(),
        ana.email(),
        new TestUsers(mockMvc, objectMapper)
            .login(ana.email(), TestUsers.PASSWORD)
            .get("accessToken")
            .asText());
  }

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    checking = api.checking(ana, "Itaú");
    cash = api.account(ana, "Carteira", "CASH", null, null).get("id").asLong();
    card = api.card(ana, "Nubank", 10, 17);
    salary = api.category(ana, "Salário");
    food = api.category(ana, "Alimentação");
  }

  private JsonNode income(String description, String amount, long account, String due)
      throws Exception {
    return api.createGroup(
        ana, api.variableBody(description, amount, account, salary, "2026-11-01", due));
  }

  private JsonNode first(JsonNode group) {
    return group.get("transactions").get(0);
  }

  private long idOf(JsonNode group) {
    return first(group).get("id").asLong();
  }

  private JsonNode tx(TestUser user, long id) throws Exception {
    return api.get(user, "/transactions/" + id);
  }

  private void pay(long id, String date, int expected) throws Exception {
    api.call(ana, HttpMethod.POST, "/transactions/" + id + "/pay", Map.of("paymentDate", date))
        .andExpect(status().is(expected));
  }

  private void unpay(long id, int expected) throws Exception {
    api.call(ana, HttpMethod.POST, "/transactions/" + id + "/unpay", null)
        .andExpect(status().is(expected));
  }

  private long countWhere(String sql, Object... args) {
    return jdbc.queryForObject(sql, Long.class, args);
  }

  @Test
  void receitaEmCartaoERejeitadaComErroNoCampoContaENadaEGravado() throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            api.variableBody("Estorno", "10.00", card, salary, "2026-11-05", null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.errors[0].field").value("accountId"))
        .andExpect(
            jsonPath("$.errors[0].message")
                .value(
                    "Receitas só podem entrar em conta bancária ou dinheiro, não em cartão de"
                        + " crédito."));
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            api.fixedBody("Bônus", "10.00", card, salary, "2026-11-05", null))
        .andExpect(status().isUnprocessableEntity());

    assertThat(countWhere("select count(*) from transaction_groups")).isZero();
    assertThat(countWhere("select count(*) from transactions")).isZero();
  }

  @Test
  void receitaEmContaBancariaEEmDinheiroEAceita() throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            api.variableBody("Salário", "100.00", checking, salary, "2026-11-05", "2026-11-20"))
        .andExpect(status().isCreated())
        .andExpect(matchesContract());
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            api.variableBody("Bico", "50.00", cash, salary, "2026-11-05", "2026-11-20"))
        .andExpect(status().isCreated())
        .andExpect(matchesContract());
  }

  @Test
  void despesaNoCartaoContinuaPermitida() throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            api.variableBody("Mercado", "100.00", card, food, "2026-11-05", null))
        .andExpect(status().isCreated())
        .andExpect(matchesContract());
  }

  @Test
  void receitaDeHojeOuDoPassadoNasceRecebidaNaDataDeVencimento() throws Exception {
    JsonNode past =
        api.json(
            api.call(
                    ana,
                    HttpMethod.POST,
                    "/transaction-groups",
                    api.variableBody(
                        "Salário", "100.00", checking, salary, "2026-11-01", "2026-11-05"))
                .andExpect(status().isCreated())
                .andExpect(matchesContract()));
    JsonNode today = income("Freela", "200.00", checking, "2026-11-10");

    assertThat(first(past).get("status").asText()).isEqualTo("PAID");
    assertThat(first(past).get("paymentDate").asText()).isEqualTo("2026-11-05");
    assertThat(first(past).get("overdue").asBoolean()).isFalse();
    assertThat(first(today).get("status").asText()).isEqualTo("PAID");
    assertThat(first(today).get("paymentDate").asText()).isEqualTo("2026-11-10");
  }

  @Test
  void receitaFixaTemAsOcorrenciasAteHojeRecebidasEAsFuturasPendentes() throws Exception {
    JsonNode group =
        api.createGroup(
            ana, api.fixedBody("Salário", "1000.00", checking, salary, "2026-09-01", "2026-09-05"));

    int paid = 0;
    for (JsonNode t : group.get("transactions")) {
      boolean due = t.get("dueDate").asText().compareTo("2026-11-10") <= 0;
      assertThat(t.get("status").asText()).isEqualTo(due ? "PAID" : "PENDING");
      assertThat(t.get("overdue").asBoolean()).isFalse();
      if (due) {
        paid++;
        assertThat(t.get("paymentDate").asText()).isEqualTo(t.get("dueDate").asText());
      }
    }
    assertThat(paid).isEqualTo(3); // set, out e nov
  }

  @Test
  void receitaParceladaLiquidaAsParcelasVencidas() throws Exception {
    Map<String, Object> body =
        api.groupBody(
            "INSTALLMENT", "Venda", "400.00", checking, salary, "2026-09-01", "2026-09-10");
    body.put("totalInstallments", 4);
    JsonNode group = api.createGroup(ana, body);

    JsonNode txs = group.get("transactions");
    assertThat(txs).hasSize(4);
    for (int i = 0; i < 3; i++) {
      assertThat(txs.get(i).get("status").asText()).isEqualTo("PAID");
      assertThat(txs.get(i).get("paymentDate").asText())
          .isEqualTo(txs.get(i).get("dueDate").asText());
    }
    assertThat(txs.get(3).get("dueDate").asText()).isEqualTo("2026-12-10");
    assertThat(txs.get(3).get("status").asText()).isEqualTo("PENDING");
  }

  @Test
  void receitaFuturaFicaPendenteENuncaEAtrasadaNemContaAPagar() throws Exception {
    JsonNode future = income("Freela", "800.00", checking, "2026-11-20");
    assertThat(first(future).get("status").asText()).isEqualTo("PENDING");
    assertThat(first(future).get("overdue").asBoolean()).isFalse();

    api.call(ana, HttpMethod.GET, "/dashboard?month=2026-11", null)
        .andExpect(jsonPath("$.overdueTotal").value("0.00"))
        .andExpect(jsonPath("$.totalToDue").value("0.00"));
    api.call(ana, HttpMethod.GET, "/due-summary?from=2026-11-01&to=2026-11-30", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.days.length()").value(0))
        .andExpect(jsonPath("$.overdue.items").value(0));

    clock.advance(Duration.ofDays(30));

    ana = relogin();
    api.call(ana, HttpMethod.GET, "/dashboard?month=2026-11", null)
        .andExpect(jsonPath("$.overdueTotal").value("0.00"));
    assertThat(tx(ana, idOf(future)).get("overdue").asBoolean()).isFalse();
  }

  @Test
  void receitaLegadaPendenteEmCartaoFicaIntactaENaoEAtrasada() throws Exception {
    long legacyId = legacyIncome(ana.id(), card, salary, "2026-11-01");

    JsonNode page = api.get(ana, "/transactions?kind=INCOME");
    assertThat(page.get("totalElements").asInt()).isEqualTo(1);
    JsonNode t = page.get("content").get(0);
    assertThat(t.get("id").asLong()).isEqualTo(legacyId);
    assertThat(t.get("status").asText()).isEqualTo("PENDING");
    assertThat(t.get("overdue").asBoolean()).isFalse();
    assertThat(countWhere("select count(*) from transactions where status = 'PAID'")).isZero();
  }

  @Test
  void antecipaReceitaFuturaEEstornaAAntecipacao() throws Exception {
    long id = idOf(income("Freela", "800.00", checking, "2026-11-20"));

    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + id + "/pay",
            Map.of("paymentDate", "2026-11-10"))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.status").value("PAID"))
        .andExpect(jsonPath("$.paymentDate").value("2026-11-10"));
    pay(id, "2026-11-10", 409);

    api.call(ana, HttpMethod.POST, "/transactions/" + id + "/unpay", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.status").value("PENDING"))
        .andExpect(jsonPath("$.paymentDate").doesNotExist());
  }

  @Test
  void receitaComVencimentoAteHojeNaoPodeSerRecebidaDeNovoNemEstornada() throws Exception {
    long id = idOf(income("Salário", "5000.00", checking, "2026-11-05"));

    pay(id, "2026-11-10", 409);
    api.call(ana, HttpMethod.POST, "/transactions/" + id + "/unpay", null)
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(
            jsonPath("$.detail")
                .value(
                    "Esta receita já entrou na conta na data informada. Para corrigir, edite ou"
                        + " exclua o lançamento."));
    assertThat(tx(ana, id).get("status").asText()).isEqualTo("PAID");
  }

  @Test
  void receitaFuturaQueChegaVirarecebidaComADataDeVencimentoOriginal() throws Exception {
    long id = idOf(income("Freela", "800.00", checking, "2026-11-20"));
    assertThat(api.get(ana, "/transactions?status=PAID").get("totalElements").asInt()).isZero();

    clock.advance(Duration.ofDays(11)); // 21/11

    ana = relogin();

    JsonNode list = api.get(ana, "/transactions?status=PAID");
    assertThat(list.get("totalElements").asInt()).isEqualTo(1);
    JsonNode t = list.get("content").get(0);
    assertThat(t.get("id").asLong()).isEqualTo(id);
    assertThat(t.get("paymentDate").asText()).isEqualTo("2026-11-20");
  }

  @Test
  void receitaAntecipadaMantemADataDePagamentoInformadaAoChegarOVencimento() throws Exception {
    long id = idOf(income("Freela", "800.00", checking, "2026-11-20"));
    pay(id, "2026-11-10", 200);

    clock.advance(Duration.ofDays(15));

    ana = relogin();

    assertThat(tx(ana, id).get("paymentDate").asText()).isEqualTo("2026-11-10");
  }

  @Test
  void viradaDoDiaUsaOFusoDeSaoPaulo() throws Exception {
    long tomorrow = idOf(income("Amanhã", "10.00", checking, "2026-11-11"));
    // 22h de 10/11 em São Paulo já é 11/11 em UTC: a receita de amanhã ainda não entrou.
    clock.set(Instant.parse("2026-11-11T01:00:00Z"));
    ana = relogin();
    assertThat(tx(ana, tomorrow).get("status").asText()).isEqualTo("PENDING");

    clock.set(Instant.parse("2026-11-11T03:00:00Z")); // 00h de 11/11 em São Paulo

    ana = relogin();
    JsonNode t = tx(ana, tomorrow);
    assertThat(t.get("status").asText()).isEqualTo("PAID");
    assertThat(t.get("paymentDate").asText()).isEqualTo("2026-11-11");
  }

  @Test
  void editarReceitaRecebidaParaOFuturoVoltaAPendenteEParaOPassadoFicaRecebida() throws Exception {
    long id = idOf(income("Salário", "5000.00", checking, "2026-11-05"));

    api.call(
            ana,
            HttpMethod.PATCH,
            "/transactions/" + id,
            Map.of("dueDate", "2026-11-25", "version", tx(ana, id).get("version").asLong()))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.status").value("PENDING"))
        .andExpect(jsonPath("$.paymentDate").doesNotExist())
        .andExpect(jsonPath("$.overdue").value(false));

    api.call(
            ana,
            HttpMethod.PATCH,
            "/transactions/" + id,
            Map.of(
                "amount",
                "5100.00",
                "dueDate",
                "2026-11-03",
                "version",
                tx(ana, id).get("version").asLong()))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.status").value("PAID"))
        .andExpect(jsonPath("$.paymentDate").value("2026-11-03"))
        .andExpect(jsonPath("$.amount").value("5100.00"));

    // Só o valor: continua recebida.
    api.call(
            ana,
            HttpMethod.PATCH,
            "/transactions/" + id,
            Map.of("amount", "5200.00", "version", tx(ana, id).get("version").asLong()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("PAID"))
        .andExpect(jsonPath("$.paymentDate").value("2026-11-03"));
  }

  private JsonNode patch(long id, Map<String, Object> fields) throws Exception {
    Map<String, Object> body = new java.util.HashMap<>(fields);
    body.put("version", tx(ana, id).get("version").asLong());
    return api.json(
        api.call(ana, HttpMethod.PATCH, "/transactions/" + id, body)
            .andExpect(status().isOk())
            .andExpect(matchesContract()));
  }

  @Test
  void editarSoOValorDeReceitaAntecipadaMantemRecebidaEADataDePagamento() throws Exception {
    long id = idOf(income("Freela", "800.00", checking, "2026-11-20"));
    pay(id, "2026-11-08", 200);

    JsonNode edited = patch(id, Map.of("amount", "850.00"));

    assertThat(edited.get("status").asText()).isEqualTo("PAID");
    assertThat(edited.get("paymentDate").asText()).isEqualTo("2026-11-08");
    assertThat(edited.get("dueDate").asText()).isEqualTo("2026-11-20");
    assertThat(edited.get("amount").asText()).isEqualTo("850.00");
  }

  @Test
  void editarSoOValorDeReceitaPassadaMantemRecebidaEADataDePagamento() throws Exception {
    long id = idOf(income("Salário", "5000.00", checking, "2026-11-05"));

    JsonNode edited = patch(id, Map.of("amount", "5300.00"));

    assertThat(edited.get("status").asText()).isEqualTo("PAID");
    assertThat(edited.get("paymentDate").asText()).isEqualTo("2026-11-05");
  }

  @Test
  void editarSoOValorDeReceitaFuturaPendenteContinuaPendente() throws Exception {
    long id = idOf(income("Freela", "800.00", checking, "2026-11-20"));

    JsonNode edited = patch(id, Map.of("amount", "900.00"));

    assertThat(edited.get("status").asText()).isEqualTo("PENDING");
    assertThat(edited.has("paymentDate") && !edited.get("paymentDate").isNull()).isFalse();
  }

  @Test
  void mudarADataDeReceitaRecebidaParaOFuturoVoltaAPendente() throws Exception {
    long id = idOf(income("Salário", "5000.00", checking, "2026-11-05"));

    JsonNode edited = patch(id, Map.of("dueDate", "2026-11-25"));

    assertThat(edited.get("status").asText()).isEqualTo("PENDING");
    assertThat(edited.has("paymentDate") && !edited.get("paymentDate").isNull()).isFalse();
  }

  @Test
  void mudarADataDeReceitaParaHojeOuPassadoFicaRecebidaNaNovaData() throws Exception {
    long future = idOf(income("Freela", "800.00", checking, "2026-11-25"));
    long antecipada = idOf(income("Bônus", "100.00", checking, "2026-11-28"));
    pay(antecipada, "2026-11-02", 200);

    JsonNode toToday = patch(future, Map.of("dueDate", "2026-11-10"));
    JsonNode toPast = patch(antecipada, Map.of("dueDate", "2026-11-04"));

    assertThat(toToday.get("status").asText()).isEqualTo("PAID");
    assertThat(toToday.get("paymentDate").asText()).isEqualTo("2026-11-10");
    assertThat(toPast.get("status").asText()).isEqualTo("PAID");
    assertThat(toPast.get("paymentDate").asText()).isEqualTo("2026-11-04");
  }

  @Test
  void enviarAMesmaDataNaoReescreveADataDePagamento() throws Exception {
    long id = idOf(income("Freela", "800.00", checking, "2026-11-20"));
    pay(id, "2026-11-08", 200);

    JsonNode edited = patch(id, Map.of("dueDate", "2026-11-20", "amount", "810.00"));

    assertThat(edited.get("status").asText()).isEqualTo("PAID");
    assertThat(edited.get("paymentDate").asText()).isEqualTo("2026-11-08");
    assertThat(edited.get("amount").asText()).isEqualTo("810.00");
  }

  @Test
  void despesaPagaContinuaNaoEditavel() throws Exception {
    JsonNode expense =
        api.createGroup(
            ana, api.variableBody("Luz", "90.00", checking, food, "2026-11-01", "2026-11-05"));
    long id = idOf(expense);
    pay(id, "2026-11-05", 200);

    api.call(
            ana,
            HttpMethod.PATCH,
            "/transactions/" + id,
            Map.of("amount", "10.00", "version", tx(ana, id).get("version").asLong()))
        .andExpect(status().isConflict());
  }

  @Test
  void excluirReceitaAvulsaRecebidaRemoveTudoEFixaMantemOHistorico() throws Exception {
    JsonNode single = income("Salário", "5000.00", checking, "2026-11-05");
    api.call(
            ana,
            HttpMethod.DELETE,
            "/transaction-groups/" + single.get("id").asLong() + "?confirm=true",
            null)
        .andExpect(status().isNoContent());
    assertThat(countWhere("select count(*) from transactions")).isZero();
    assertThat(countWhere("select count(*) from transaction_groups")).isZero();

    JsonNode fixed =
        api.createGroup(
            ana, api.fixedBody("Pensão", "300.00", checking, salary, "2026-09-01", "2026-09-05"));
    api.call(
            ana,
            HttpMethod.DELETE,
            "/transaction-groups/" + fixed.get("id").asLong() + "?confirm=true",
            null)
        .andExpect(status().isNoContent());
    assertThat(countWhere("select count(*) from transactions where status = 'PAID'")).isEqualTo(3);
    assertThat(countWhere("select count(*) from transactions where status = 'PENDING'")).isZero();
  }

  @Test
  void campoSettledLegadoNoCorpoEIgnorado() throws Exception {
    Map<String, Object> body =
        api.variableBody("Freela", "800.00", checking, salary, "2026-11-01", "2026-11-20");
    body.put("settled", true);

    JsonNode created =
        api.json(
            api.call(ana, HttpMethod.POST, "/transaction-groups", body)
                .andExpect(status().isCreated()));

    assertThat(first(created).get("status").asText()).isEqualTo("PENDING");
  }

  @Test
  void despesaNaoMudaPendenteEntraNaAtrasadaEPagamentoContinuaManual() throws Exception {
    JsonNode expense =
        api.createGroup(
            ana, api.variableBody("Luz", "90.00", checking, food, "2026-11-01", "2026-11-05"));

    JsonNode t = first(expense);
    assertThat(t.get("status").asText()).isEqualTo("PENDING");
    assertThat(t.get("overdue").asBoolean()).isTrue();
    api.call(ana, HttpMethod.GET, "/dashboard?month=2026-11", null)
        .andExpect(jsonPath("$.overdueTotal").value("90.00"));
    api.call(ana, HttpMethod.GET, "/due-summary?from=2026-11-01&to=2026-11-30", null)
        .andExpect(jsonPath("$.overdue.items").value(1));

    long id = idOf(expense);
    pay(id, "2026-11-10", 200);
    unpay(id, 200);
  }

  @Test
  void liquidacaoENoEscopoDoUsuarioDaRequisicao() throws Exception {
    TestUser bia = new TestUsers(mockMvc, objectMapper).registerAndLogin("bia@example.com");
    long biaChecking = api.checking(bia, "Nubank PJ");
    long biaSalary = api.category(bia, "Salário");
    // Receita vencida e pendente da Bia (cenário anterior à regra), inserida direto no banco.
    long biaTx = legacyIncome(bia.id(), biaChecking, biaSalary, "2026-11-01");

    income("Salário", "5000.00", checking, "2026-11-05"); // a Ana consulta e liquida as dela
    api.get(ana, "/transactions");

    assertThat(
            jdbc.queryForObject(
                "select status from transactions where id = ?", String.class, biaTx))
        .isEqualTo("PENDING");

    // Na vez da Bia, a dela é liquidada, e a da Ana não é tocada.
    api.get(bia, "/transactions");
    assertThat(
            jdbc.queryForObject(
                "select status from transactions where id = ?", String.class, biaTx))
        .isEqualTo("PAID");
    // Ana não enxerga nem altera a da Bia.
    api.call(ana, HttpMethod.GET, "/transactions/" + biaTx, null).andExpect(status().isNotFound());
  }

  /** Receita pendente e vencida, como existia antes da liquidação automática. Devolve o id. */
  private long legacyIncome(long userId, long account, long category, String due) {
    long group =
        jdbc.queryForObject(
            "insert into transaction_groups (user_id, description, recurrence_type,"
                + " total_installments, total_amount, account_id, category_id, purchase_date,"
                + " first_due_date) values (?, 'Legado', 'VARIABLE', 1, 100.00, ?, ?, ?::date,"
                + " ?::date) returning id",
            Long.class,
            userId,
            account,
            category,
            due,
            due);
    return jdbc.queryForObject(
        "insert into transactions (group_id, user_id, account_id, category_id, installment_number,"
            + " reference_month, amount, due_date, status) values (?, ?, ?, ?, 1,"
            + " date_trunc('month', ?::date)::date, 100.00, ?::date, 'PENDING') returning id",
        Long.class,
        group,
        userId,
        account,
        category,
        due,
        due);
  }
}
