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
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

class TransactionPayUnpayListIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long checking;
  private long cash;
  private long food;
  private long leisure;
  private long salary;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    checking = api.checking(ana, "Itaú");
    cash = api.account(ana, "Carteira", "CASH", null, null).get("id").asLong();
    food = api.category(ana, "Alimentação");
    leisure = api.category(ana, "Lazer");
    salary = api.category(ana, "Salário");
  }

  private long variable(String desc, String amount, long account, long category, String due)
      throws Exception {
    JsonNode group =
        api.createGroup(ana, api.variableBody(desc, amount, account, category, due, due));
    return group.get("transactions").get(0).get("id").asLong();
  }

  @Test
  void pagaComDataEDesfazRemoveAData() throws Exception {
    long id = variable("Mercado", "150.00", checking, food, "2026-11-15");

    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + id + "/pay",
            Map.of("paymentDate", "2026-11-09"))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.status").value("PAID"))
        .andExpect(jsonPath("$.paymentDate").value("2026-11-09"));
    api.call(ana, HttpMethod.POST, "/transactions/" + id + "/unpay", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.status").value("PENDING"))
        .andExpect(jsonPath("$.paymentDate").doesNotExist());
  }

  @Test
  void pagarDuasVezesEDesfazerPendenteSaoRecusados() throws Exception {
    long id = variable("Mercado", "150.00", checking, food, "2026-11-15");

    api.call(ana, HttpMethod.POST, "/transactions/" + id + "/unpay", null)
        .andExpect(status().isConflict());
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + id + "/pay",
            Map.of("paymentDate", "2026-11-09"))
        .andExpect(status().isOk());
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + id + "/pay",
            Map.of("paymentDate", "2026-11-09"))
        .andExpect(status().isConflict())
        .andExpect(matchesContract());
  }

  @Test
  void pagamentoSemDataOuComDataInvalidaERecusado() throws Exception {
    long id = variable("Mercado", "150.00", checking, food, "2026-11-15");

    api.call(ana, HttpMethod.POST, "/transactions/" + id + "/pay", Map.of())
        .andExpect(status().isUnprocessableEntity());
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + id + "/pay",
            Map.of("paymentDate", "2026-02-30"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void pendenteVencidoFicaMarcadoComoAtrasadoAteSerPago() throws Exception {
    long late = variable("Luz", "90.00", checking, food, "2026-11-05"); // hoje é 2026-11-10
    long future = variable("Água", "50.00", checking, food, "2026-11-20");
    long today = variable("Gás", "30.00", checking, food, "2026-11-10");

    assertThat(api.get(ana, "/transactions/" + late).get("overdue").asBoolean()).isTrue();
    assertThat(api.get(ana, "/transactions/" + future).get("overdue").asBoolean()).isFalse();
    assertThat(api.get(ana, "/transactions/" + today).get("overdue").asBoolean()).isFalse();

    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + late + "/pay",
            Map.of("paymentDate", "2026-11-10"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.overdue").value(false));
  }

  @Test
  void filtraPorMesContaCategoriaTipoRecorrenciaEStatus() throws Exception {
    variable("Mercado", "150.00", checking, food, "2026-11-15");
    long paid = variable("Cinema", "40.00", cash, leisure, "2026-11-20");
    variable("Pizza", "60.00", cash, food, "2026-12-03");
    api.createGroup(
        ana, api.fixedBody("Salário", "5000.00", checking, salary, "2026-11-05", "2026-11-05"));
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + paid + "/pay",
            Map.of("paymentDate", "2026-11-20"))
        .andExpect(status().isOk());

    assertThat(api.get(ana, "/transactions?month=2026-11").get("totalElements").asInt())
        .isEqualTo(3);
    assertThat(api.get(ana, "/transactions?month=2026-12").get("totalElements").asInt())
        .isEqualTo(2);
    assertThat(api.get(ana, "/transactions?accountId=" + cash).get("totalElements").asInt())
        .isEqualTo(2);
    assertThat(api.get(ana, "/transactions?categoryId=" + leisure).get("totalElements").asInt())
        .isEqualTo(1);
    assertThat(api.get(ana, "/transactions?kind=INCOME&month=2026-11").get("totalElements").asInt())
        .isEqualTo(1);
    assertThat(
            api.get(ana, "/transactions?kind=EXPENSE&month=2026-11").get("totalElements").asInt())
        .isEqualTo(2);
    assertThat(api.get(ana, "/transactions?recurrenceType=FIXED").get("totalElements").asInt())
        .isEqualTo(12);
    // Cinema pago à mão e o Salário de 05/11, que já entrou na conta sozinho.
    assertThat(api.get(ana, "/transactions?status=PAID").get("totalElements").asInt()).isEqualTo(2);
    assertThat(
            api.get(ana, "/transactions?status=PENDING&month=2026-11&kind=EXPENSE")
                .get("totalElements")
                .asInt())
        .isEqualTo(1);
  }

  @Test
  void paginaOrdenandoPorVencimento() throws Exception {
    variable("C", "3.00", checking, food, "2026-11-30");
    variable("A", "1.00", checking, food, "2026-11-01");
    variable("B", "2.00", checking, food, "2026-11-15");

    api.call(ana, HttpMethod.GET, "/transactions?month=2026-11&size=2&page=0", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.totalElements").value(3))
        .andExpect(jsonPath("$.size").value(2))
        .andExpect(jsonPath("$.content[0].description").value("A"))
        .andExpect(jsonPath("$.content[1].description").value("B"));
    api.call(ana, HttpMethod.GET, "/transactions?month=2026-11&size=2&page=1", null)
        .andExpect(jsonPath("$.content.length()").value(1))
        .andExpect(jsonPath("$.content[0].description").value("C"));
  }

  @Test
  void parametrosInvalidosSaoRecusados() throws Exception {
    api.call(ana, HttpMethod.GET, "/transactions?month=2026-13", null)
        .andExpect(status().isBadRequest());
    api.call(ana, HttpMethod.GET, "/transactions?size=500", null)
        .andExpect(status().isBadRequest());
    api.call(ana, HttpMethod.GET, "/transactions?status=ABERTO", null)
        .andExpect(status().isBadRequest());
  }

  @Test
  void editaValorEVencimentoDeOcorrenciaPendente() throws Exception {
    long id = variable("Mercado", "150.00", checking, food, "2026-11-15");
    JsonNode tx = api.get(ana, "/transactions/" + id);

    api.call(
            ana,
            HttpMethod.PATCH,
            "/transactions/" + id,
            Map.of(
                "amount", "175.50", "dueDate", "2026-12-02", "version", tx.get("version").asLong()))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.amount").value("175.50"))
        .andExpect(jsonPath("$.dueDate").value("2026-12-02"));
    assertThat(api.get(ana, "/transactions?month=2026-12").get("totalElements").asInt())
        .isEqualTo(1);
    assertThat(api.get(ana, "/transactions?month=2026-11").get("totalElements").asInt()).isZero();
  }
}
