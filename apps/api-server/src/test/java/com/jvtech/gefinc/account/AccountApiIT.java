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
  void saldoInicialAusenteVale0EEPersistidoQuandoInformado() throws Exception {
    create(body("Sem saldo", "CHECKING", null, null))
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.openingBalance").value("0.00"));

    Map<String, Object> withBalance = body("Com saldo", "CHECKING", null, null);
    withBalance.put("openingBalance", "1234.56");
    JsonNode created =
        objectMapper.readTree(
            create(withBalance)
                .andExpect(status().isCreated())
                .andExpect(matchesContract())
                .andExpect(jsonPath("$.openingBalance").value("1234.56"))
                .andReturn()
                .getResponse()
                .getContentAsString());

    mockMvc
        .perform(
            get("/accounts/" + created.get("id").asLong())
                .header(HttpHeaders.AUTHORIZATION, ana.bearer()))
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.openingBalance").value("1234.56"));

    Map<String, Object> negative = body("No vermelho", "CASH", null, null);
    negative.put("openingBalance", "-50.00");
    create(negative)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.openingBalance").value("-50.00"));
  }

  @Test
  void editaOSaldoInicialEAusenciaMantemOValorAtual() throws Exception {
    Map<String, Object> input = body("Itaú", "CHECKING", null, null);
    input.put("openingBalance", "100.00");
    JsonNode account = createOk(input);

    // Sem o campo: não zera o saldo inicial.
    JsonNode renamed =
        objectMapper.readTree(
            update(account.get("id").asLong(), updateBody(account, Map.of("name", "Itaú PF")))
                .andExpect(status().isOk())
                .andExpect(matchesContract())
                .andExpect(jsonPath("$.openingBalance").value("100.00"))
                .andReturn()
                .getResponse()
                .getContentAsString());

    update(account.get("id").asLong(), updateBody(renamed, Map.of("openingBalance", "250.75")))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.openingBalance").value("250.75"));
  }

  @Test
  void cartaoComSaldoInicialDiferenteDeZeroERecusado() throws Exception {
    Map<String, Object> card = body("Nubank", "CREDIT_CARD", 10, 17);
    card.put("openingBalance", "10.00");
    create(card)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.errors[?(@.field=='openingBalance')]").exists());

    card.put("openingBalance", "0.00");
    JsonNode created =
        objectMapper.readTree(
            create(card)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.openingBalance").value("0.00"))
                .andReturn()
                .getResponse()
                .getContentAsString());

    update(created.get("id").asLong(), updateBody(created, Map.of("openingBalance", "5.00")))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='openingBalance')]").exists());
  }

  @Test
  void saldoInicialForaDoFormatoDeDinheiroERecusado() throws Exception {
    Map<String, Object> input = body("Itaú", "CHECKING", null, null);
    input.put("openingBalance", "10");
    create(input).andExpect(status().isUnprocessableEntity());
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

  private JsonNode fetch(long id) throws Exception {
    return objectMapper.readTree(
        mockMvc
            .perform(get("/accounts/" + id).header(HttpHeaders.AUTHORIZATION, ana.bearer()))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  @Test
  void contaSemCorNaoDevolveColorHex() throws Exception {
    create(body("Itaú", "CHECKING", null, null))
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.colorHex").doesNotExist());
  }

  @Test
  void cadastraContaEmCartaoComCorENormalizaParaMaiusculas() throws Exception {
    Map<String, Object> bank = body("Itaú", "CHECKING", null, null);
    bank.put("colorHex", "#2563eb");
    create(bank)
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.colorHex").value("#2563EB"));

    Map<String, Object> card = body("Nubank", "CREDIT_CARD", 10, 17);
    card.put("colorHex", "#7C3AED");
    JsonNode created =
        objectMapper.readTree(
            create(card)
                .andExpect(status().isCreated())
                .andExpect(matchesContract())
                .andExpect(jsonPath("$.colorHex").value("#7C3AED"))
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertThat(fetch(created.get("id").asLong()).get("colorHex").asText()).isEqualTo("#7C3AED");
  }

  @Test
  void corForaDoFormatoERecusadaNoCampoColorHex() throws Exception {
    for (String invalid :
        new String[] {"red", "#12345", "#GGGGGG", "123456", "#1234567", " ", ""}) {
      Map<String, Object> input = body("Conta " + invalid.hashCode(), "CHECKING", null, null);
      input.put("colorHex", invalid);
      create(input)
          .andExpect(status().isUnprocessableEntity())
          .andExpect(jsonPath("$.errors[?(@.field=='colorHex')]").exists());
    }
    JsonNode account = createOk(body("Itaú", "CHECKING", null, null));
    update(account.get("id").asLong(), updateBody(account, Map.of("colorHex", "#GGGGGG")))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='colorHex')]").exists());
  }

  @Test
  void editaACorEAusenciaMantemEVaziaRemove() throws Exception {
    Map<String, Object> input = body("Itaú", "CHECKING", null, null);
    input.put("colorHex", "#2563EB");
    JsonNode account = createOk(input);
    long id = account.get("id").asLong();

    // trocar a cor, em minúsculas
    JsonNode changed =
        objectMapper.readTree(
            update(id, updateBody(account, Map.of("colorHex", "#dc2626")))
                .andExpect(status().isOk())
                .andExpect(matchesContract())
                .andExpect(jsonPath("$.colorHex").value("#DC2626"))
                .andReturn()
                .getResponse()
                .getContentAsString());

    // ausente (cliente antigo): mantém a cor
    JsonNode renamed =
        objectMapper.readTree(
            update(id, updateBody(changed, Map.of("name", "Itaú PF")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.colorHex").value("#DC2626"))
                .andReturn()
                .getResponse()
                .getContentAsString());

    // "" remove a cor
    JsonNode cleared =
        objectMapper.readTree(
            update(id, updateBody(renamed, Map.of("colorHex", "")))
                .andExpect(status().isOk())
                .andExpect(matchesContract())
                .andExpect(jsonPath("$.colorHex").doesNotExist())
                .andReturn()
                .getResponse()
                .getContentAsString());
    assertThat(fetch(id).has("colorHex")).isFalse();
    assertThat(cleared.has("colorHex")).isFalse();
    assertThat(jdbc.queryForObject("select color_hex from accounts where id = ?", String.class, id))
        .isNull();
  }

  @Test
  void inativarSemEnviarColorHexPreservaACor() throws Exception {
    Map<String, Object> input = body("Nubank", "CREDIT_CARD", 10, 17);
    input.put("colorHex", "#7C3AED");
    JsonNode card = createOk(input);

    update(card.get("id").asLong(), updateBody(card, Map.of("active", false)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(false))
        .andExpect(jsonPath("$.colorHex").value("#7C3AED"));
  }

  @Test
  void cartaoAntigoSemVinculoMantemACorAoSerInativadoEExigeVinculoParaTrocala() throws Exception {
    Map<String, Object> input = body("Antigo", "CREDIT_CARD", 10, 17);
    input.put("colorHex", "#7C3AED");
    JsonNode card = createOk(input);
    long id = card.get("id").asLong();
    jdbc.update("update accounts set bank_account_id = null where id = ?", id);
    JsonNode legacy = fetch(id);
    assertThat(legacy.path("bankAccountId").isMissingNode()).isTrue();

    // só ativar/inativar: não exige vínculo e não perde a cor, enviando-a ou não
    JsonNode inactive =
        objectMapper.readTree(
            update(id, updateBody(legacy, Map.of("active", false, "colorHex", "#7c3aed")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.colorHex").value("#7C3AED"))
                .andReturn()
                .getResponse()
                .getContentAsString());
    JsonNode reactivated =
        objectMapper.readTree(
            update(id, updateBody(inactive, Map.of("active", true)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.colorHex").value("#7C3AED"))
                .andReturn()
                .getResponse()
                .getContentAsString());

    // trocar a cor deixa de ser "só ativar/inativar": o vínculo passa a ser exigido e a cor fica
    update(id, updateBody(reactivated, Map.of("colorHex", "#DC2626")))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='bankAccountId')]").exists());
    assertThat(fetch(id).get("colorHex").asText()).isEqualTo("#7C3AED");
    update(id, updateBody(reactivated, Map.of("colorHex", "#DC2626", "bankAccountId", bankId())))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.colorHex").value("#DC2626"));
  }

  @Test
  void exigeAutenticacao() throws Exception {
    mockMvc.perform(get("/accounts")).andExpect(status().isUnauthorized());
    mockMvc
        .perform(post("/accounts").contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isUnauthorized());
  }
}
