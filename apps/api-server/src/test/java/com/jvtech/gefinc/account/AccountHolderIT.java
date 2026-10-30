package com.jvtech.gefinc.account;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/** Tipo de titular (PF/PJ) e ícone identificador das contas (FR-001 a FR-007). */
class AccountHolderIT extends IntegrationTestBase {

  private TestUser ana;

  @BeforeEach
  void init() throws Exception {
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
  }

  private Map<String, Object> body(String name, String type, String holderType, String icon) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("type", type);
    if (holderType != null) {
      body.put("holderType", holderType);
    }
    if (icon != null) {
      body.put("icon", icon);
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
    return objectMapper.readTree(
        create(body)
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  @Test
  void contaBancariaExigeOTipoDeTitular() throws Exception {
    create(body("Itaú", "CHECKING", null, null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.errors[?(@.field=='holderType')]").exists());
  }

  @Test
  void dinheiroECartaoNaoTemTipoDeTitular() throws Exception {
    create(body("Carteira", "CASH", "PF", null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='holderType')]").exists());
    Map<String, Object> card = body("Nubank", "CREDIT_CARD", "PJ", null);
    card.put("closingDay", 10);
    card.put("dueDay", 17);
    create(card)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='holderType')]").exists());
  }

  @Test
  void cadastraContaPessoaFisicaEJuridicaComIconeEscolhido() throws Exception {
    create(body("Itaú pessoal", "CHECKING", "PF", "landmark"))
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.holderType").value("PF"))
        .andExpect(jsonPath("$.icon").value("landmark"));
    create(body("Inter empresa", "CHECKING", "PJ", "briefcase"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.holderType").value("PJ"))
        .andExpect(jsonPath("$.icon").value("briefcase"));
  }

  @Test
  void semIconeAReespostaTrazOPadraoDoTipo() throws Exception {
    create(body("Itaú", "CHECKING", "PF", null)).andExpect(jsonPath("$.icon").value("bank"));
    create(body("Inter PJ", "CHECKING", "PJ", null))
        .andExpect(jsonPath("$.icon").value("building"));
    create(body("Carteira", "CASH", null, null)).andExpect(jsonPath("$.icon").value("cash"));
    Map<String, Object> card = body("Nubank", "CREDIT_CARD", null, null);
    card.put("closingDay", 10);
    card.put("dueDay", 17);
    card.put("bankAccountId", createOk(body("Banco", "CHECKING", "PF", null)).get("id").asLong());
    create(card).andExpect(jsonPath("$.icon").value("card"));
  }

  @Test
  void iconeForaDoCatalogoERecusado() throws Exception {
    create(body("Itaú", "CHECKING", "PF", "foguete-inexistente"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void alteraOTipoDeTitularDePessoaFisicaParaJuridica() throws Exception {
    JsonNode account = createOk(body("Itaú", "CHECKING", "PF", null));
    Map<String, Object> update = new LinkedHashMap<>();
    update.put("name", "Itaú");
    update.put("type", "CHECKING");
    update.put("holderType", "PJ");
    update.put("icon", "building");
    update.put("active", true);
    update.put("version", account.get("version").asLong());
    mockMvc
        .perform(
            put("/accounts/" + account.get("id").asLong())
                .header(HttpHeaders.AUTHORIZATION, ana.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(update)))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.holderType").value("PJ"))
        .andExpect(jsonPath("$.icon").value("building"));
    mockMvc
        .perform(get("/accounts").header(HttpHeaders.AUTHORIZATION, ana.bearer()))
        .andExpect(jsonPath("$[0].holderType").value("PJ"));
  }
}
