package com.jvtech.gefinc.account;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/** Cartão vinculado a uma conta bancária (FR-008 a FR-014, Princípio III). */
class CardBankLinkIT extends IntegrationTestBase {

  private TestUser ana;
  private TestUser bia;
  private TestApi api;
  private long itau;
  private long inter;

  @BeforeEach
  void init() throws Exception {
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    ana = users.registerAndLogin("ana@example.com");
    bia = users.registerAndLogin("bia@example.com");
    api = new TestApi(mockMvc, objectMapper);
    itau = api.checking(ana, "Itaú", "PF");
    inter = api.checking(ana, "Inter PJ", "PJ");
  }

  private Map<String, Object> card(String name, Long bankAccountId) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("type", "CREDIT_CARD");
    body.put("closingDay", 10);
    body.put("dueDay", 17);
    if (bankAccountId != null) {
      body.put("bankAccountId", bankAccountId);
    }
    return body;
  }

  private ResultActions create(TestUser user, Map<String, Object> body) throws Exception {
    return mockMvc.perform(
        post("/accounts")
            .header(HttpHeaders.AUTHORIZATION, user.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(body)));
  }

  private ResultActions update(TestUser user, JsonNode account, Map<String, Object> overrides)
      throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", account.get("name").asText());
    body.put("type", account.get("type").asText());
    body.put("closingDay", account.get("closingDay").asInt());
    body.put("dueDay", account.get("dueDay").asInt());
    body.put("active", account.get("active").asBoolean());
    body.put("version", account.get("version").asLong());
    body.putAll(overrides);
    return mockMvc.perform(
        put("/accounts/" + account.get("id").asLong())
            .header(HttpHeaders.AUTHORIZATION, user.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(body)));
  }

  @Test
  void cartaoSemContaBancariaERecusado() throws Exception {
    create(ana, card("Nubank", null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.errors[?(@.field=='bankAccountId')]").exists());
  }

  @Test
  void cartaoVinculadoTrazContaENomeETitularHerdado() throws Exception {
    create(ana, card("Inter Black", inter))
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.bankAccountId").value(inter))
        .andExpect(jsonPath("$.bankAccountName").value("Inter PJ"))
        .andExpect(jsonPath("$.holderType").value("PJ"));
  }

  @Test
  void vinculoComContaDeOutroUsuarioRespondeNaoEncontrado() throws Exception {
    create(bia, card("Nubank", itau)).andExpect(status().isNotFound());
  }

  @Test
  void vinculoComContaQueNaoEBancariaOuInativaERecusado() throws Exception {
    JsonNode cash = api.account(ana, "Carteira", "CASH", null, null);
    create(ana, card("Nubank", cash.get("id").asLong()))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='bankAccountId')]").exists());

    JsonNode other = api.account(ana, "Santander", "CHECKING", null, null);
    mockMvc
        .perform(
            put("/accounts/" + other.get("id").asLong())
                .header(HttpHeaders.AUTHORIZATION, ana.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of(
                            "name", "Santander",
                            "type", "CHECKING",
                            "holderType", "PF",
                            "active", false,
                            "version", other.get("version").asLong()))))
        .andExpect(status().isOk());
    create(ana, card("Nubank", other.get("id").asLong()))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("ACCOUNT_INACTIVE"));
  }

  @Test
  void trocarOVinculoNaoAlteraLancamentosNemFaturas() throws Exception {
    JsonNode card = api.cardOn(ana, "Nubank", 10, 17, itau);
    long cardId = card.get("id").asLong();
    long food = api.category(ana, "Alimentação");
    api.createGroup(ana, api.variableBody("Mercado", "100.00", cardId, food, "2026-10-05", null));
    String before = api.get(ana, "/transactions").toString();

    update(ana, card, Map.of("bankAccountId", inter))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.bankAccountName").value("Inter PJ"))
        .andExpect(jsonPath("$.holderType").value("PJ"));

    assertThat(api.get(ana, "/transactions").toString()).isEqualTo(before);
  }

  @Test
  void cartaoAntigoSemVinculoExigeOVinculoAoEditarMasPodeSerInativado() throws Exception {
    JsonNode card = api.cardOn(ana, "Antigo", 10, 17, itau);
    long cardId = card.get("id").asLong();
    jdbc.update("update accounts set bank_account_id = null where id = ?", cardId);
    JsonNode legacy = api.get(ana, "/accounts/" + cardId);
    assertThat(legacy.path("bankAccountId").isMissingNode()).isTrue();
    assertThat(legacy.path("holderType").isMissingNode()).isTrue();

    update(ana, legacy, Map.of("name", "Antigo renomeado"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='bankAccountId')]").exists());

    update(ana, legacy, Map.of("active", false)).andExpect(status().isOk());
    JsonNode inactive = api.get(ana, "/accounts/" + cardId);
    update(ana, inactive, Map.of("active", true, "bankAccountId", itau))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.bankAccountId").value(itau));
  }

  @Test
  void excluirContaComCartoesVinculadosRespondeConflitoEInativarEPermitido() throws Exception {
    api.cardOn(ana, "Nubank", 10, 17, itau);
    mockMvc
        .perform(delete("/accounts/" + itau).header(HttpHeaders.AUTHORIZATION, ana.bearer()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ACCOUNT_IN_USE"));

    JsonNode bank = api.get(ana, "/accounts/" + itau);
    mockMvc
        .perform(
            put("/accounts/" + itau)
                .header(HttpHeaders.AUTHORIZATION, ana.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of(
                            "name", "Itaú",
                            "type", "CHECKING",
                            "holderType", "PF",
                            "active", false,
                            "version", bank.get("version").asLong()))))
        .andExpect(status().isOk());
  }
}
