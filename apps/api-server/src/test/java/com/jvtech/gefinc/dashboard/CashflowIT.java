package com.jvtech.gefinc.dashboard;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

class CashflowIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private TestUser bia;
  private long checking;
  private long card;
  private long salary;
  private long food;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    ana = users.registerAndLogin("ana@example.com");
    bia = users.registerAndLogin("bia@example.com");
    checking = api.checking(ana, "Itaú");
    card = api.card(ana, "Nubank", 10, 17);
    salary = api.category(ana, "Salário");
    food = api.category(ana, "Alimentação");
  }

  @Test
  void saldoResidualEReceitasMenosDespesasPrevistasDeCadaMes() throws Exception {
    api.createGroup(
        ana, api.fixedBody("Salário", "5000.00", checking, salary, "2026-11-05", "2026-11-05"));
    api.createGroup(
        ana, api.variableBody("Mercado", "1200.00", checking, food, "2026-11-08", "2026-11-12"));
    Map<String, Object> installments =
        api.groupBody("INSTALLMENT", "Geladeira", "300.00", card, food, "2026-11-12", null);
    installments.put("totalInstallments", 3); // dez, jan, fev
    api.createGroup(ana, installments);

    api.call(ana, HttpMethod.GET, "/cashflow?from=2026-11&months=3", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.length()").value(3))
        .andExpect(jsonPath("$[0].month").value("2026-11"))
        .andExpect(jsonPath("$[0].expectedIncome").value("5000.00"))
        .andExpect(jsonPath("$[0].expectedExpense").value("1200.00"))
        .andExpect(jsonPath("$[0].residual").value("3800.00"))
        .andExpect(jsonPath("$[1].expectedExpense").value("100.00"))
        .andExpect(jsonPath("$[1].residual").value("4900.00"));
  }

  @Test
  void despesaMaiorQueAReceitaDaSaldoNegativo() throws Exception {
    api.createGroup(
        ana, api.variableBody("Reforma", "9000.00", checking, food, "2026-11-08", "2026-11-12"));

    api.call(ana, HttpMethod.GET, "/cashflow?from=2026-11&months=1", null)
        .andExpect(jsonPath("$[0].expectedIncome").value("0.00"))
        .andExpect(jsonPath("$[0].residual").value("-9000.00"));
  }

  @Test
  void naoConsideraOStatusEMesesSemLancamentosFicamZerados() throws Exception {
    JsonNode group =
        api.createGroup(
            ana, api.variableBody("Mercado", "200.00", checking, food, "2026-11-08", "2026-11-12"));
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + group.get("transactions").get(0).get("id").asLong() + "/pay",
            Map.of("paymentDate", "2026-11-12"))
        .andExpect(status().isOk());

    api.call(ana, HttpMethod.GET, "/cashflow?from=2026-11&months=2", null)
        .andExpect(jsonPath("$[0].expectedExpense").value("200.00")) // pago continua previsto
        .andExpect(jsonPath("$[1].expectedExpense").value("0.00"))
        .andExpect(jsonPath("$[1].residual").value("0.00"));
  }

  @Test
  void usuariosNaoEnxergamOFluxoDeCaixaUmDoOutro() throws Exception {
    api.createGroup(
        ana, api.fixedBody("Salário", "5000.00", checking, salary, "2026-11-05", "2026-11-05"));

    JsonNode bias = api.get(bia, "/cashflow?from=2026-11&months=2");
    assertThat(bias.get(0).get("expectedIncome").asText()).isEqualTo("0.00");
    assertThat(bias.get(0).get("residual").asText()).isEqualTo("0.00");
  }

  @Test
  void parametrosInvalidosSaoRecusados() throws Exception {
    api.call(ana, HttpMethod.GET, "/cashflow?months=3", null).andExpect(status().isBadRequest());
    api.call(ana, HttpMethod.GET, "/cashflow?from=2026-11&months=30", null)
        .andExpect(status().isBadRequest());
  }
}
