package com.jvtech.gefinc.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Atalhos para montar o cenário dos testes de integração pelos próprios endpoints da API. */
public final class TestApi {

  private final MockMvc mockMvc;
  private final ObjectMapper mapper;

  public TestApi(MockMvc mockMvc, ObjectMapper mapper) {
    this.mockMvc = mockMvc;
    this.mapper = mapper;
  }

  public ResultActions call(TestUser user, HttpMethod method, String url, Object body)
      throws Exception {
    MockHttpServletRequestBuilder builder =
        request(method, url).header(HttpHeaders.AUTHORIZATION, user.bearer());
    if (body != null) {
      builder.contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body));
    }
    return mockMvc.perform(builder);
  }

  public JsonNode json(ResultActions actions) throws Exception {
    return mapper.readTree(actions.andReturn().getResponse().getContentAsString());
  }

  public JsonNode get(TestUser user, String url) throws Exception {
    return json(call(user, HttpMethod.GET, url, null).andExpect(status().isOk()));
  }

  /**
   * Cria uma conta e devolve o corpo da resposta. Conta bancária sai como pessoa física; cartão é
   * vinculado a uma conta bancária criada junto ("Banco de &lt;nome&gt;").
   */
  public JsonNode account(
      TestUser user, String name, String type, Integer closingDay, Integer dueDay)
      throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("type", type);
    if ("CHECKING".equals(type)) {
      body.put("holderType", "PF");
    }
    if ("CREDIT_CARD".equals(type)) {
      body.put("bankAccountId", checking(user, "Banco de " + name));
    }
    if (closingDay != null) {
      body.put("closingDay", closingDay);
      body.put("dueDay", dueDay);
    }
    return postAccount(user, body);
  }

  /** Cria uma conta com o corpo exatamente como informado e espera {@code 201}. */
  public JsonNode postAccount(TestUser user, Map<String, Object> body) throws Exception {
    return json(call(user, HttpMethod.POST, "/accounts", body).andExpect(status().isCreated()));
  }

  public long checking(TestUser user, String name) throws Exception {
    return checking(user, name, "PF");
  }

  public long checking(TestUser user, String name, String holderType) throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("type", "CHECKING");
    body.put("holderType", holderType);
    return postAccount(user, body).get("id").asLong();
  }

  public long card(TestUser user, String name, int closingDay, int dueDay) throws Exception {
    return account(user, name, "CREDIT_CARD", closingDay, dueDay).get("id").asLong();
  }

  /** Cartão vinculado a uma conta bancária já existente. */
  public JsonNode cardOn(TestUser user, String name, int closingDay, int dueDay, long bankAccountId)
      throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("type", "CREDIT_CARD");
    body.put("closingDay", closingDay);
    body.put("dueDay", dueDay);
    body.put("bankAccountId", bankAccountId);
    return postAccount(user, body);
  }

  /**
   * Edita uma conta reenviando todos os campos atuais (inclusive titular, ícone e vínculo) com as
   * alterações informadas, e espera {@code 200}.
   */
  public ResultActions updateAccount(TestUser user, long accountId, Map<String, Object> changes)
      throws Exception {
    JsonNode account = get(user, "/accounts/" + accountId);
    Map<String, Object> body = new LinkedHashMap<>();
    for (String field :
        new String[] {
          "name", "type", "closingDay", "dueDay", "holderType", "icon", "bankAccountId"
        }) {
      boolean inheritedHolder =
          field.equals("holderType") && !"CHECKING".equals(account.get("type").asText());
      if (account.has(field) && !inheritedHolder) {
        body.put(field, mapper.convertValue(account.get(field), Object.class));
      }
    }
    body.put("active", account.get("active").asBoolean());
    body.put("version", account.get("version").asLong());
    body.putAll(changes);
    return call(user, HttpMethod.PUT, "/accounts/" + accountId, body);
  }

  /** Id de uma das categorias iniciais do usuário, pelo nome. */
  public long category(TestUser user, String name) throws Exception {
    for (JsonNode category : get(user, "/categories")) {
      if (category.get("name").asText().equals(name)) {
        return category.get("id").asLong();
      }
    }
    throw new IllegalStateException("Categoria não encontrada: " + name);
  }

  public Map<String, Object> variableBody(
      String description,
      String amount,
      long accountId,
      long categoryId,
      String purchaseDate,
      String firstDueDate) {
    return groupBody(
        "VARIABLE", description, amount, accountId, categoryId, purchaseDate, firstDueDate);
  }

  public Map<String, Object> fixedBody(
      String description,
      String amount,
      long accountId,
      long categoryId,
      String purchaseDate,
      String firstDueDate) {
    return groupBody(
        "FIXED", description, amount, accountId, categoryId, purchaseDate, firstDueDate);
  }

  public Map<String, Object> groupBody(
      String type,
      String description,
      String amount,
      long accountId,
      long categoryId,
      String purchaseDate,
      String firstDueDate) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("description", description);
    body.put("recurrenceType", type);
    body.put("totalAmount", amount);
    body.put("accountId", accountId);
    body.put("categoryId", categoryId);
    body.put("purchaseDate", purchaseDate);
    if (firstDueDate != null) {
      body.put("firstDueDate", firstDueDate);
    }
    return body;
  }

  /** Cria o grupo (espera 201) e devolve o detalhe com as ocorrências geradas. */
  public JsonNode createGroup(TestUser user, Map<String, Object> body) throws Exception {
    return json(
        call(user, HttpMethod.POST, "/transaction-groups", body).andExpect(status().isCreated()));
  }

  /**
   * Compra avulsa no cartão após o fechamento (dia 12), que cai na fatura de dezembro/2026
   * (vencimento dia 17).
   */
  public JsonNode decemberPurchase(
      TestUser user, long cardId, long categoryId, String description, String amount)
      throws Exception {
    return createGroup(
        user, variableBody(description, amount, cardId, categoryId, "2026-11-12", null));
  }

  public ResultActions payInvoice(
      TestUser user, long accountId, String month, String amount, String paidAt) throws Exception {
    return call(
        user,
        HttpMethod.POST,
        "/accounts/" + accountId + "/invoices/" + month + "/payments",
        Map.of("amount", amount, "paidAt", paidAt));
  }

  public ResultActions settleInvoice(TestUser user, long accountId, String month, String paidAt)
      throws Exception {
    return call(
        user,
        HttpMethod.POST,
        "/accounts/" + accountId + "/invoices/" + month + "/payments/settle",
        Map.of("paidAt", paidAt));
  }
}
