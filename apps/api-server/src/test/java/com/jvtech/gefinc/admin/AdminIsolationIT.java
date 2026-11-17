package com.jvtech.gefinc.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Isolamento financeiro do painel (SC-004, Constituição v1.4.0): o administrador administra contas,
 * não finanças. Semeia contas, cartões, categorias, lançamentos e transferências de dois usuários,
 * percorre <strong>todas</strong> as rotas GET de {@code /admin/**} como administrador e prova que
 * nenhuma resposta traz valor, nome de conta ou categoria, descrição nem chave de dado financeiro.
 * O teste enumera as rotas reais e <strong>falha</strong> se houver uma rota GET nova sem cobertura
 * aqui (ou uma cobertura de rota que já não existe): cada história do painel que acrescenta um GET
 * acrescenta a linha em {@link #coverage}.
 *
 * <p>Também mantém a prova de que um administrador, como usuário comum, continua recebendo {@code
 * 404} nos recursos financeiros de terceiros.
 */
class AdminIsolationIT extends IntegrationTestBase {

  /**
   * Trechos que só existem nos dados financeiros semeados: nomes de conta, cartão, banco, categoria
   * e descrição, e os valores (com ponto, vírgula e sem zeros finais).
   */
  private static final List<String> MARKERS =
      List.of(
          "Sigilos",
          "sigilos",
          "confidencial",
          "98765",
          "12345.67",
          "12345,67",
          "76543",
          "54321",
          "Banco de");

  /** Nomes de campo de dado financeiro que nenhuma resposta do painel pode ter. */
  private static final Set<String> FINANCIAL_FIELDS =
      Set.of(
          "accounts",
          "account",
          "accountId",
          "cards",
          "card",
          "categories",
          "category",
          "categoryId",
          "transactions",
          "transaction",
          "groups",
          "transfers",
          "transfer",
          "invoice",
          "invoices",
          "balance",
          "balances",
          "amount",
          "totalAmount",
          "description",
          "openingBalance");

  @Autowired
  @Qualifier("requestMappingHandlerMapping")
  private RequestMappingHandlerMapping handlerMapping;

  private TestApi api;
  private TestUser admin;
  private TestUser ana;
  private TestUser bia;
  private long anaAccount;
  private long anaGroup;
  private long anaTransaction;
  private long anaTransfer;
  private long adminId;
  private long auditSuspension;
  private long auditAttempt;
  private long auditParameter;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    ana = users.registerAndLogin("ana@iso.com");
    bia = users.registerAndLogin("bia@iso.com");
    adminId = seed.createAdmin("adm@iso.com").id();
    admin =
        new TestUser(
            adminId,
            "adm@iso.com",
            users.login("adm@iso.com", TestUsers.PASSWORD).get("accessToken").asText());
    anaAccount = seedFinances(ana, "A", "98765.43", "12345.67");
    seedFinances(bia, "B", "76543.21", "54321.09");
    anaTransfer =
        api.get(ana, "/transfers?month=2026-11").path("content").get(0).get("id").asLong();
    JsonNode transaction = api.get(ana, "/transactions").path("content").get(0);
    anaGroup = transaction.get("groupId").asLong();
    anaTransaction = transaction.get("id").asLong();
    seedAudit();
  }

  /**
   * Trilha semeada para a varredura: uma ação com justificativa, uma tentativa negada com IP e
   * dispositivo (o detalhe mostra o {@code client}) e uma troca de parâmetro com detalhes.
   */
  private void seedAudit() {
    auditSuspension =
        jdbc.queryForObject(
            "INSERT INTO audit_log (occurred_at, action, result, actor_kind, actor_user_id,"
                + " target_user_id, reason_text, details) VALUES (now(), 'USER_SUSPENDED',"
                + " 'SUCCESS', 'ADMIN', ?, ?, 'Pedido do suporte, chamado 12', '{}'::jsonb)"
                + " RETURNING id",
            Long.class,
            adminId,
            ana.id());
    auditAttempt =
        jdbc.queryForObject(
            "INSERT INTO audit_log (occurred_at, action, result, actor_kind, actor_user_id,"
                + " target_user_id, refusal_code, details, client_ref) VALUES (now(),"
                + " 'REVERT_ATTEMPT', 'REFUSED', 'USER', ?, ?, 'ACCOUNT_SUSPENDED', '{}'::jsonb,"
                + " 'abcdef0123456789abcdef0123456789') RETURNING id",
            Long.class,
            bia.id(),
            bia.id());
    jdbc.update(
        "INSERT INTO audit_log_client (audit_id, user_id, ip, device_label) VALUES (?, ?,"
            + " '203.0.113.50', 'Firefox em Linux')",
        auditAttempt,
        bia.id());
    auditParameter =
        jdbc.queryForObject(
            "INSERT INTO audit_log (occurred_at, action, result, actor_kind, actor_user_id,"
                + " subject, details) VALUES (now(), 'PARAMETER_CHANGED', 'SUCCESS', 'ADMIN', ?,"
                + " 'SIGNUPS_OPEN', '{\"from\":\"true\",\"to\":\"false\"}'::jsonb) RETURNING id",
            Long.class,
            adminId);
  }

  /** Conta corrente, carteira, cartão, categoria, um lançamento e uma transferência do usuário. */
  private long seedFinances(TestUser user, String tag, String purchase, String transfer)
      throws Exception {
    long checking = api.checking(user, "Conta Sigilosa " + tag);
    long cash = api.cash(user, "Carteira Sigilosa " + tag);
    api.card(user, "Cartão Sigiloso " + tag, 10, 17);
    Map<String, Object> category = new LinkedHashMap<>();
    category.put("name", "Categoria Sigilosa " + tag);
    category.put("type", "EXPENSE");
    category.put("colorHex", "#112233");
    long categoryId =
        api.json(
                api.call(user, HttpMethod.POST, "/categories", category)
                    .andExpect(status().isCreated()))
            .get("id")
            .asLong();
    api.createGroup(
        user,
        api.variableBody(
            "Compra confidencial " + tag,
            purchase,
            checking,
            categoryId,
            "2026-11-05",
            "2026-11-05"));
    api.transfer(user, checking, cash, transfer, "2026-11-06");
    return checking;
  }

  // ------------------------------------------------------------------ cobertura das rotas GET

  /**
   * Rota GET de {@code /admin/**} (padrão) e as URLs com que o teste a percorre. Acrescente a linha
   * ao criar um GET novo; o teste falha enquanto a rota não estiver aqui.
   */
  private Map<String, List<String>> coverage() {
    Map<String, List<String>> map = new LinkedHashMap<>();
    map.put(
        "/admin/users",
        List.of(
            "/admin/users",
            "/admin/users?size=100",
            "/admin/users?q=iso.com",
            "/admin/users?q=sigilos",
            "/admin/users?status=ACTIVE&sort=lastAccessAt&dir=asc"));
    map.put(
        "/admin/users/{userId}",
        List.of("/admin/users/" + ana.id(), "/admin/users/" + bia.id(), "/admin/users/" + adminId));
    map.put(
        "/admin/users/{userId}/sessions",
        List.of(
            "/admin/users/" + ana.id() + "/sessions",
            "/admin/users/" + bia.id() + "/sessions",
            "/admin/users/" + adminId + "/sessions"));
    map.put(
        "/admin/audit",
        List.of(
            "/admin/audit",
            "/admin/audit?limit=100",
            "/admin/audit?actorId=" + adminId,
            "/admin/audit?targetUserId=" + ana.id(),
            "/admin/audit?result=REFUSED&action=REVERT_ATTEMPT"));
    map.put(
        "/admin/audit/{auditId}",
        List.of(
            "/admin/audit/" + auditSuspension,
            "/admin/audit/" + auditAttempt,
            "/admin/audit/" + auditParameter));
    map.put("/admin/email/config", List.of("/admin/email/config"));
    map.put(
        "/admin/email/deliveries",
        List.of(
            "/admin/email/deliveries",
            "/admin/email/deliveries?limit=100",
            "/admin/email/deliveries?status=FAILED&kind=PASSWORD_RESET"));
    map.put("/admin/parameters", List.of("/admin/parameters"));
    map.put(
        "/admin/invitations",
        List.of(
            "/admin/invitations",
            "/admin/invitations?status=PENDING",
            "/admin/invitations?status=ACCEPTED",
            "/admin/invitations?status=CANCELED",
            "/admin/invitations?status=EXPIRED"));
    return map;
  }

  private List<String> realGetPatterns() {
    List<String> patterns = new ArrayList<>();
    for (Map.Entry<RequestMappingInfo, HandlerMethod> entry :
        handlerMapping.getHandlerMethods().entrySet()) {
      RequestMappingInfo info = entry.getKey();
      boolean get =
          info.getMethodsCondition().getMethods().isEmpty()
              || info.getMethodsCondition().getMethods().stream()
                  .anyMatch(method -> method.name().equals("GET"));
      if (!get) {
        continue;
      }
      for (var pattern : info.getPathPatternsCondition().getPatterns()) {
        if (pattern.getPatternString().startsWith("/admin")) {
          patterns.add(pattern.getPatternString());
        }
      }
    }
    return patterns;
  }

  @Test
  void todaRotaGetDeAdminTemCoberturaNesteTeste() {
    Set<String> real = new TreeSet<>(realGetPatterns());
    Set<String> covered = new TreeSet<>(coverage().keySet());

    assertThat(real)
        .as("rotas GET de /admin/** sem cobertura em AdminIsolationIT.coverage()")
        .isSubsetOf(covered);
    assertThat(covered).as("cobertura de rota que já não existe").isSubsetOf(real);
  }

  // ------------------------------------------------------------------ varredura das respostas

  @Test
  void asSementesDeTesteExistemNasRespostasDoProprioDono() throws Exception {
    // Guarda contra um teste vazio: os marcadores aparecem nas respostas financeiras do dono.
    String accounts = api.get(ana, "/accounts").toString();
    String categories = api.get(ana, "/categories").toString();
    String transactions = api.get(ana, "/transactions").toString();
    assertThat(transactions).isNotEmpty();

    assertThat(accounts).contains("Sigilos");
    assertThat(categories).contains("Sigilos");
    assertThat(transactions).contains("confidencial").contains("98765");
  }

  @Test
  void nenhumGetDeAdminTrazDadoFinanceiroDeNinguem() throws Exception {
    int visited = 0;
    for (Map.Entry<String, List<String>> route : coverage().entrySet()) {
      for (String url : route.getValue()) {
        MvcResult result =
            mockMvc.perform(get(url).header(HttpHeaders.AUTHORIZATION, admin.bearer())).andReturn();
        assertThat(result.getResponse().getStatus()).as("GET %s", url).isEqualTo(200);
        String body = result.getResponse().getContentAsString();
        for (String marker : MARKERS) {
          assertThat(body).as("GET %s não pode conter '%s'", url, marker).doesNotContain(marker);
        }
        Set<String> names = new TreeSet<>();
        collectFieldNames(objectMapper.readTree(body), names);
        assertThat(names).as("campos de GET %s", url).doesNotContainAnyElementsOf(FINANCIAL_FIELDS);
        visited++;
      }
    }
    assertThat(visited).isGreaterThanOrEqualTo(16);
  }

  private static void collectFieldNames(JsonNode node, Set<String> names) {
    node.fieldNames().forEachRemaining(names::add);
    node.forEach(child -> collectFieldNames(child, names));
  }

  // ------------------------------------------------------------------ recursos de terceiros

  @Test
  void administradorComoUsuarioComumContinuaComNotFoundNosRecursosDeTerceiros() throws Exception {
    for (String url :
        List.of(
            "/accounts/" + anaAccount,
            "/accounts/" + anaAccount + "/usage",
            "/transaction-groups/" + anaGroup,
            "/transactions/" + anaTransaction,
            "/transfers/" + anaTransfer)) {
      mockMvc
          .perform(get(url).header(HttpHeaders.AUTHORIZATION, admin.bearer()))
          .andExpect(status().isNotFound());
    }
  }

  @Test
  void listasFinanceirasDoAdministradorNaoTrazNadaDeTerceiros() throws Exception {
    for (String url :
        List.of("/accounts", "/categories", "/transactions", "/transfers?month=2026-11")) {
      String body = api.get(admin, url).toString();
      for (String marker : MARKERS) {
        assertThat(body).as("GET %s", url).doesNotContain(marker);
      }
    }
  }
}
