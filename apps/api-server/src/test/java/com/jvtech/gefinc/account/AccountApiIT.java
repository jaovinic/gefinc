package com.jvtech.gefinc.account;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.ResultActions;

@RecordApplicationEvents
class AccountApiIT extends IntegrationTestBase {

  @Autowired private ApplicationEvents events;

  private TestUser ana;

  @BeforeEach
  void init() throws Exception {
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
  }

  private Long bankId;

  /** Conta bancária base para vincular os cartões, criada na primeira necessidade. */
  private long bankId() throws Exception {
    if (bankId == null) {
      Map<String, Object> bank = new LinkedHashMap<>();
      bank.put("name", "Banco base");
      bank.put("type", "CHECKING");
      bank.put("holderType", "PF");
      bankId = createOk(bank).get("id").asLong();
    }
    return bankId;
  }

  private Map<String, Object> body(String name, String type, Integer closing, Integer due)
      throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("type", type);
    if ("CHECKING".equals(type)) {
      body.put("holderType", "PF");
    }
    if ("CREDIT_CARD".equals(type)) {
      body.put("bankAccountId", bankId());
    }
    if (closing != null) {
      body.put("closingDay", closing);
    }
    if (due != null) {
      body.put("dueDay", due);
    }
    return body;
  }

  private ResultActions create(Map<String, Object> body) throws Exception {
    return mockMvc.perform(
        post("/accounts")
            .header(HttpHeaders.AUTHORIZATION, ana.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(body)));
  }

  private JsonNode createOk(Map<String, Object> body) throws Exception {
    String json =
        create(body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    return objectMapper.readTree(json);
  }

  private ResultActions update(long id, Map<String, Object> body) throws Exception {
    return mockMvc.perform(
        put("/accounts/" + id)
            .header(HttpHeaders.AUTHORIZATION, ana.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(body)));
  }

  private Map<String, Object> updateBody(JsonNode account, Map<String, Object> overrides) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", account.get("name").asText());
    body.put("type", account.get("type").asText());
    if (account.has("closingDay")) {
      body.put("closingDay", account.get("closingDay").asInt());
      body.put("dueDay", account.get("dueDay").asInt());
    }
    if (account.has("holderType") && "CHECKING".equals(account.get("type").asText())) {
      body.put("holderType", account.get("holderType").asText());
    }
    if (account.has("bankAccountId")) {
      body.put("bankAccountId", account.get("bankAccountId").asLong());
    }
    body.put("active", account.get("active").asBoolean());
    body.put("version", account.get("version").asLong());
    body.putAll(overrides);
    return body;
  }

  @Test
  void cadastraContaCorrenteEDinheiroSemDias() throws Exception {
    create(body("Conta Itaú", "CHECKING", null, null))
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.name").value("Conta Itaú"))
        .andExpect(jsonPath("$.type").value("CHECKING"))
        .andExpect(jsonPath("$.active").value(true))
        .andExpect(jsonPath("$.closingDay").doesNotExist());
    create(body("Carteira", "CASH", null, null)).andExpect(status().isCreated());
  }

  @Test
  void cadastraCartaoComDiasDeFechamentoEVencimento() throws Exception {
    create(body("Nubank", "CREDIT_CARD", 10, 17))
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.closingDay").value(10))
        .andExpect(jsonPath("$.dueDay").value(17));
  }

  @Test
  void cartaoSemDiasERecusadoIndicandoOsCampos() throws Exception {
    create(body("Nubank", "CREDIT_CARD", null, null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.errors[?(@.field=='closingDay')]").exists())
        .andExpect(jsonPath("$.errors[?(@.field=='dueDay')]").exists());
  }

  @Test
  void diasForaDeUmATrintaEUmEContaSemCartaoComDiasSaoRecusados() throws Exception {
    create(body("Nubank", "CREDIT_CARD", 0, 17))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='closingDay')]").exists());
    create(body("Nubank", "CREDIT_CARD", 10, 32))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='dueDay')]").exists());
    create(body("Itaú", "CHECKING", 10, 17))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='closingDay')]").exists());
  }

  @Test
  void recusaNomeVazioETipoInvalido() throws Exception {
    create(body("  ", "CHECKING", null, null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='name')]").exists());
    create(body("X", "POUPANCA", null, null)).andExpect(status().isBadRequest());
  }

  @Test
  void listaOrdenadaPorNomeEEscondeInativasPorPadrao() throws Exception {
    createOk(body("Wise", "CHECKING", null, null));
    JsonNode carteira = createOk(body("Carteira", "CASH", null, null));
    createOk(body("Nubank", "CREDIT_CARD", 10, 17));
    update(carteira.get("id").asLong(), updateBody(carteira, Map.of("active", false)))
        .andExpect(status().isOk());

    mockMvc
        .perform(get("/accounts").header(HttpHeaders.AUTHORIZATION, ana.bearer()))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.length()").value(3))
        .andExpect(jsonPath("$[0].name").value("Banco base"))
        .andExpect(jsonPath("$[1].name").value("Nubank"))
        .andExpect(jsonPath("$[2].name").value("Wise"));
    mockMvc
        .perform(
            get("/accounts")
                .param("includeInactive", "true")
                .header(HttpHeaders.AUTHORIZATION, ana.bearer()))
        .andExpect(jsonPath("$.length()").value(4))
        .andExpect(jsonPath("$[1].name").value("Carteira"));
  }

  @Test
  void editaNomeEDiasIncrementandoAVersao() throws Exception {
    JsonNode card = createOk(body("Nubank", "CREDIT_CARD", 10, 17));

    update(
            card.get("id").asLong(),
            updateBody(card, Map.of("name", "Nubank Ultravioleta", "dueDay", 20)))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.name").value("Nubank Ultravioleta"))
        .andExpect(jsonPath("$.dueDay").value(20))
        .andExpect(jsonPath("$.version").value(card.get("version").asLong() + 1));
  }

  @Test
  void mudancaDosDiasDoCartaoPublicaOEventoESemMudancaNaoPublica() throws Exception {
    JsonNode card = createOk(body("Nubank", "CREDIT_CARD", 10, 17));

    update(card.get("id").asLong(), updateBody(card, Map.of("name", "Outro nome")))
        .andExpect(status().isOk());
    assertThat(events.stream(CardDaysChangedEvent.class).count()).isZero();

    JsonNode renamed =
        objectMapper.readTree(
            mockMvc
                .perform(
                    get("/accounts/" + card.get("id").asLong())
                        .header(HttpHeaders.AUTHORIZATION, ana.bearer()))
                .andReturn()
                .getResponse()
                .getContentAsString());
    update(card.get("id").asLong(), updateBody(renamed, Map.of("closingDay", 12)))
        .andExpect(status().isOk());
    assertThat(events.stream(CardDaysChangedEvent.class).count()).isEqualTo(1);
  }

  @Test
  void versaoDesatualizadaRetorna409() throws Exception {
    JsonNode account = createOk(body("Itaú", "CHECKING", null, null));
    update(account.get("id").asLong(), updateBody(account, Map.of("name", "Itaú 2")))
        .andExpect(status().isOk());

    update(account.get("id").asLong(), updateBody(account, Map.of("name", "Itaú 3")))
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("STALE_VERSION"));
  }

  @Test
  void naoPermiteTrocarOTipoDaConta() throws Exception {
    JsonNode account = createOk(body("Itaú", "CHECKING", null, null));

    update(account.get("id").asLong(), updateBody(account, Map.of("type", "CASH")))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='type')]").exists());
  }

  @Test
  void nomeUnicoEntreContasAtivasSemDiferenciarMaiusculas() throws Exception {
    JsonNode first = createOk(body("Nubank", "CREDIT_CARD", 10, 17));

    create(body("NUBANK", "CASH", null, null))
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("ACCOUNT_NAME_TAKEN"));

    update(first.get("id").asLong(), updateBody(first, Map.of("active", false)))
        .andExpect(status().isOk());
    create(body("Nubank", "CREDIT_CARD", 5, 12)).andExpect(status().isCreated());
  }

  @Test
  void reativarContaComNomeJaUsadoPorOutraAtivaERecusado() throws Exception {
    JsonNode old = createOk(body("Nubank", "CREDIT_CARD", 10, 17));
    JsonNode inactive =
        objectMapper.readTree(
            update(old.get("id").asLong(), updateBody(old, Map.of("active", false)))
                .andReturn()
                .getResponse()
                .getContentAsString());
    createOk(body("Nubank", "CREDIT_CARD", 5, 12));

    update(old.get("id").asLong(), updateBody(inactive, Map.of("active", true)))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ACCOUNT_NAME_TAKEN"));
  }

  @Test
  void excluiContaSemLancamentos() throws Exception {
    JsonNode account = createOk(body("Itaú", "CHECKING", null, null));

    mockMvc
        .perform(
            delete("/accounts/" + account.get("id").asLong())
                .header(HttpHeaders.AUTHORIZATION, ana.bearer()))
        .andExpect(status().isNoContent());
    mockMvc
        .perform(
            get("/accounts/" + account.get("id").asLong())
                .header(HttpHeaders.AUTHORIZATION, ana.bearer()))
        .andExpect(status().isNotFound());
  }

  @Test
  void exigeAutenticacao() throws Exception {
    mockMvc.perform(get("/accounts")).andExpect(status().isUnauthorized());
    mockMvc
        .perform(post("/accounts").contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isUnauthorized());
  }
}
