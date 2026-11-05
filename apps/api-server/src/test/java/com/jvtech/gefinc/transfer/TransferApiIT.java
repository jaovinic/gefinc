package com.jvtech.gefinc.transfer;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
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
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.ResultActions;

/** CRUD de transferências e suas regras de validação. "Hoje" nos testes é 10/11/2026. */
class TransferApiIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private TestUser bia;
  private long itau;
  private long wallet;
  private long nubank;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    ana = users.registerAndLogin("ana@example.com");
    bia = users.registerAndLogin("bia@example.com");
    itau = api.checking(ana, "Itaú");
    wallet = api.cash(ana, "Carteira");
    nubank = api.card(ana, "Nubank", 10, 17);
  }

  private ResultActions post(TestUser user, Map<String, Object> body) throws Exception {
    return api.call(user, HttpMethod.POST, "/transfers", body);
  }

  private Map<String, Object> update(JsonNode transfer, Map<String, Object> changes) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("fromAccountId", transfer.get("fromAccountId").asLong());
    body.put("toAccountId", transfer.get("toAccountId").asLong());
    body.put("amount", transfer.get("amount").asText());
    body.put("transferDate", transfer.get("transferDate").asText());
    body.put("version", transfer.get("version").asLong());
    body.putAll(changes);
    return body;
  }

  @Test
  void criaConsultaListaEditaEExclui() throws Exception {
    Map<String, Object> body = api.transferBody(itau, wallet, "250.00", "2026-11-08");
    body.put("description", "  Saque para o mês  ");
    JsonNode created =
        api.json(
            post(ana, body)
                .andExpect(status().isCreated())
                .andExpect(matchesContract())
                .andExpect(jsonPath("$.fromAccountId").value(itau))
                .andExpect(jsonPath("$.toAccountId").value(wallet))
                .andExpect(jsonPath("$.amount").value("250.00"))
                .andExpect(jsonPath("$.transferDate").value("2026-11-08"))
                .andExpect(jsonPath("$.description").value("Saque para o mês"))
                .andExpect(jsonPath("$.scheduled").value(false))
                .andExpect(jsonPath("$.version").value(0)));
    long id = created.get("id").asLong();

    api.call(ana, HttpMethod.GET, "/transfers/" + id, null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.id").value(id));
    JsonNode page =
        api.json(
            api.call(ana, HttpMethod.GET, "/transfers?month=2026-11", null)
                .andExpect(status().isOk())
                .andExpect(matchesContract()));
    assertThat(page.get("totalElements").asLong()).isEqualTo(1);
    assertThat(page.get("content").get(0).get("id").asLong()).isEqualTo(id);

    JsonNode edited =
        api.json(
            api.call(
                    ana,
                    HttpMethod.PUT,
                    "/transfers/" + id,
                    update(
                        created,
                        Map.of(
                            "fromAccountId",
                            wallet,
                            "toAccountId",
                            itau,
                            "amount",
                            "100.50",
                            "transferDate",
                            "2026-11-20")))
                .andExpect(status().isOk())
                .andExpect(matchesContract())
                .andExpect(jsonPath("$.amount").value("100.50"))
                .andExpect(jsonPath("$.scheduled").value(true))
                .andExpect(jsonPath("$.version").value(1)));
    // PUT é substituição completa: a descrição ausente é limpa.
    assertThat(edited.has("description")).isFalse();

    api.call(ana, HttpMethod.DELETE, "/transfers/" + id, null).andExpect(status().isNoContent());
    api.call(ana, HttpMethod.GET, "/transfers/" + id, null).andExpect(status().isNotFound());
    api.call(ana, HttpMethod.DELETE, "/transfers/" + id, null).andExpect(status().isNotFound());
    assertThat(api.get(ana, "/transfers?month=2026-11").get("totalElements").asLong()).isZero();
  }

  @Test
  void descricaoVaziaOuSoComEspacosFicaAusente() throws Exception {
    Map<String, Object> body = api.transferBody(itau, wallet, "10.00", "2026-11-10");
    body.put("description", "   ");
    post(ana, body)
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.description").doesNotExist());
  }

  @Test
  void aceitaDataPassadaHojeEFuturaMarcandoAgendada() throws Exception {
    for (String[] c :
        new String[][] {{"2026-01-05", "false"}, {"2026-11-10", "false"}, {"2026-11-11", "true"}}) {
      post(ana, api.transferBody(itau, wallet, "1.00", c[0]))
          .andExpect(status().isCreated())
          .andExpect(matchesContract())
          .andExpect(jsonPath("$.scheduled").value(Boolean.parseBoolean(c[1])));
    }
  }

  @Test
  void dataForaDa1900a2200ERecusadaNaCriacaoENaEdicao() throws Exception {
    JsonNode created = api.transfer(ana, itau, wallet, "10.00", "2026-11-10");
    long id = created.get("id").asLong();
    for (String date : new String[] {"1899-12-31", "2201-01-01"}) {
      post(ana, api.transferBody(itau, wallet, "10.00", date))
          .andExpect(status().isUnprocessableEntity())
          .andExpect(matchesContract())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
          .andExpect(jsonPath("$.errors[0].field").value("transferDate"))
          .andExpect(jsonPath("$.errors[0].message").value(TransferService.DATE_RANGE_MESSAGE));
      api.call(
              ana,
              HttpMethod.PUT,
              "/transfers/" + id,
              update(created, Map.of("transferDate", date)))
          .andExpect(status().isUnprocessableEntity())
          .andExpect(matchesContract())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
          .andExpect(jsonPath("$.errors[0].field").value("transferDate"));
    }
    assertThat(jdbc.queryForObject("select count(*) from account_transfers", Integer.class))
        .isEqualTo(1);
  }

  @Test
  void datasLimiteDe1900e2200SaoAceitasNaCriacaoENaEdicao() throws Exception {
    for (String date : new String[] {"1900-01-01", "2200-12-31"}) {
      post(ana, api.transferBody(itau, wallet, "10.00", date))
          .andExpect(status().isCreated())
          .andExpect(matchesContract())
          .andExpect(jsonPath("$.transferDate").value(date));
    }
    JsonNode created = api.transfer(ana, itau, wallet, "10.00", "2026-11-10");
    long id = created.get("id").asLong();
    JsonNode first =
        api.json(
            api.call(
                    ana,
                    HttpMethod.PUT,
                    "/transfers/" + id,
                    update(created, Map.of("transferDate", "1900-01-01")))
                .andExpect(status().isOk())
                .andExpect(matchesContract())
                .andExpect(jsonPath("$.transferDate").value("1900-01-01")));
    api.call(
            ana,
            HttpMethod.PUT,
            "/transfers/" + id,
            update(first, Map.of("transferDate", "2200-12-31")))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.transferDate").value("2200-12-31"));
  }

  @Test
  void origemIgualADestinoERecusada() throws Exception {
    post(ana, api.transferBody(itau, itau, "10.00", "2026-11-10"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
        .andExpect(jsonPath("$.errors[0].field").value("toAccountId"));
  }

  @Test
  void valorZeroNegativoOuForaDoLimiteERecusado() throws Exception {
    for (String amount : new String[] {"0.00", "-5.00", "10000000000000000.00"}) {
      post(ana, api.transferBody(itau, wallet, amount, "2026-11-10"))
          .andExpect(status().isUnprocessableEntity())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
          .andExpect(jsonPath("$.errors[0].field").value("amount"));
    }
  }

  @Test
  void valorComTresCasasOuNaoStringERecusado() throws Exception {
    post(ana, api.transferBody(itau, wallet, "10.123", "2026-11-10"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    Map<String, Object> asNumber = api.transferBody(itau, wallet, "10.00", "2026-11-10");
    asNumber.put("amount", 10);
    post(ana, asNumber)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    assertThat(jdbc.queryForObject("select count(*) from account_transfers", Integer.class))
        .isZero();
  }

  @Test
  void camposObrigatoriosAusentesSaoRecusados() throws Exception {
    post(ana, Map.of())
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors.length()").value(4));
  }

  @Test
  void descricaoComMaisDe120CaracteresERecusada() throws Exception {
    Map<String, Object> body = api.transferBody(itau, wallet, "10.00", "2026-11-10");
    body.put("description", "x".repeat(121));
    post(ana, body)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[0].field").value("description"));
    body.put("description", "x".repeat(120));
    post(ana, body).andExpect(status().isCreated()).andExpect(matchesContract());
  }

  @Test
  void cartaoDeCreditoNuncaParticipaNaOrigemNemNoDestino() throws Exception {
    post(ana, api.transferBody(nubank, itau, "10.00", "2026-11-10"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
        .andExpect(jsonPath("$.errors[0].field").value("fromAccountId"));
    post(ana, api.transferBody(itau, nubank, "10.00", "2026-11-10"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.errors[0].field").value("toAccountId"));
  }

  @Test
  void contaInativaNaOrigemOuNoDestinoERecusadaNaCriacaoENaEdicao() throws Exception {
    JsonNode created = api.transfer(ana, itau, wallet, "10.00", "2026-11-10");
    long extra = api.checking(ana, "Inter");
    api.updateAccount(ana, extra, Map.of("active", false)).andExpect(status().isOk());

    post(ana, api.transferBody(extra, wallet, "10.00", "2026-11-10"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("ACCOUNT_INACTIVE"))
        .andExpect(jsonPath("$.errors[0].field").value("fromAccountId"));
    post(ana, api.transferBody(wallet, extra, "10.00", "2026-11-10"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("ACCOUNT_INACTIVE"))
        .andExpect(jsonPath("$.errors[0].field").value("toAccountId"));
    api.call(
            ana,
            HttpMethod.PUT,
            "/transfers/" + created.get("id").asLong(),
            update(created, Map.of("toAccountId", extra)))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("ACCOUNT_INACTIVE"));
  }

  @Test
  void editarTransferenciaDeContaQueFoiInativadaERecusadoMasExcluirEPermitido() throws Exception {
    JsonNode created = api.transfer(ana, itau, wallet, "10.00", "2026-11-10");
    long id = created.get("id").asLong();
    api.updateAccount(ana, wallet, Map.of("active", false)).andExpect(status().isOk());

    api.call(ana, HttpMethod.PUT, "/transfers/" + id, update(created, Map.of("amount", "11.00")))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("ACCOUNT_INACTIVE"))
        .andExpect(jsonPath("$.errors[0].field").value("toAccountId"));
    api.call(ana, HttpMethod.DELETE, "/transfers/" + id, null).andExpect(status().isNoContent());
  }

  @Test
  void contaInexistenteOuDeOutroUsuarioRespondeIgualAo404() throws Exception {
    long biaAccount = api.checking(bia, "Bradesco");
    String message = "Conta não encontrada.";
    post(ana, api.transferBody(itau, biaAccount, "10.00", "2026-11-10"))
        .andExpect(status().isNotFound())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.detail").value(message));
    post(ana, api.transferBody(biaAccount, itau, "10.00", "2026-11-10"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value(message));
    post(ana, api.transferBody(itau, 999_999L, "10.00", "2026-11-10"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value(message));

    JsonNode created = api.transfer(ana, itau, wallet, "10.00", "2026-11-10");
    api.call(
            ana,
            HttpMethod.PUT,
            "/transfers/" + created.get("id").asLong(),
            update(created, Map.of("toAccountId", biaAccount)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value(message));
  }

  @Test
  void versaoDesatualizadaResponde409() throws Exception {
    JsonNode created = api.transfer(ana, itau, wallet, "10.00", "2026-11-10");
    long id = created.get("id").asLong();
    api.call(ana, HttpMethod.PUT, "/transfers/" + id, update(created, Map.of("amount", "20.00")))
        .andExpect(status().isOk());

    api.call(ana, HttpMethod.PUT, "/transfers/" + id, update(created, Map.of("amount", "30.00")))
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("STALE_VERSION"));
    assertThat(api.get(ana, "/transfers/" + id).get("amount").asText()).isEqualTo("20.00");
  }

  @Test
  void listaFiltraPorMesEPorContaDeOrigemOuDestinoDaMaisRecenteParaAMaisAntiga() throws Exception {
    long inter = api.checking(ana, "Inter");
    api.transfer(ana, itau, wallet, "1.00", "2026-11-02");
    api.transfer(ana, wallet, inter, "2.00", "2026-11-15");
    api.transfer(ana, inter, itau, "3.00", "2026-11-15");
    api.transfer(ana, itau, wallet, "4.00", "2026-10-31");
    api.transfer(ana, itau, wallet, "5.00", "2026-12-01");

    JsonNode november = api.get(ana, "/transfers?month=2026-11");
    assertThat(november.get("totalElements").asLong()).isEqualTo(3);
    assertThat(november.get("content").get(0).get("amount").asText()).isEqualTo("3.00");
    assertThat(november.get("content").get(1).get("amount").asText()).isEqualTo("2.00");
    assertThat(november.get("content").get(2).get("amount").asText()).isEqualTo("1.00");

    JsonNode byInter = api.get(ana, "/transfers?month=2026-11&accountId=" + inter);
    assertThat(byInter.get("totalElements").asLong()).isEqualTo(2);
    JsonNode byItau = api.get(ana, "/transfers?month=2026-11&accountId=" + itau);
    assertThat(byItau.get("totalElements").asLong()).isEqualTo(2);

    JsonNode paged = api.get(ana, "/transfers?month=2026-11&page=1&size=2");
    assertThat(paged.get("content")).hasSize(1);
    assertThat(paged.get("totalElements").asLong()).isEqualTo(3);
    assertThat(paged.get("page").asInt()).isEqualTo(1);
    assertThat(paged.get("size").asInt()).isEqualTo(2);
  }

  @Test
  void paginacaoOuMesInvalidosRespondem400() throws Exception {
    for (String query :
        new String[] {
          "month=2026-11&size=0",
          "month=2026-11&size=201",
          "month=2026-11&page=-1",
          "month=novembro",
          ""
        }) {
      api.call(ana, HttpMethod.GET, "/transfers?" + query, null)
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    }
    api.call(ana, HttpMethod.GET, "/transfers?month=2026-11&size=200", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract());
  }

  @Test
  void semTokenRespondeNaoAutorizado() throws Exception {
    mockMvc
        .perform(
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(
                "/transfers?month=2026-11"))
        .andExpect(status().isUnauthorized());
  }
}
