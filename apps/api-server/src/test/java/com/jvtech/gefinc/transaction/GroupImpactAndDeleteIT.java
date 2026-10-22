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
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

class GroupImpactAndDeleteIT extends IntegrationTestBase {

  @Autowired private FixedRecurrenceJob job;

  private TestApi api;
  private TestUser ana;
  private long checking;
  private long shopping;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    checking = api.checking(ana, "Itaú");
    shopping = api.category(ana, "Compras");
  }

  private JsonNode threeInstallmentsWithOnePaid() throws Exception {
    Map<String, Object> body =
        api.groupBody(
            "INSTALLMENT", "Notebook", "300.00", checking, shopping, "2026-11-01", "2026-11-10");
    body.put("totalInstallments", 3);
    JsonNode group = api.createGroup(ana, body);
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + group.get("transactions").get(0).get("id").asLong() + "/pay",
            Map.of("paymentDate", "2026-11-10"))
        .andExpect(status().isOk());
    return group;
  }

  @Test
  void impactoInformaPagasEPendentesComSeusValores() throws Exception {
    long id = threeInstallmentsWithOnePaid().get("id").asLong();

    api.call(ana, HttpMethod.GET, "/transaction-groups/" + id + "/impact", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.paidCount").value(1))
        .andExpect(jsonPath("$.pendingCount").value(2))
        .andExpect(jsonPath("$.paidAmount").value("100.00"))
        .andExpect(jsonPath("$.pendingAmount").value("200.00"));
  }

  @Test
  void excluirExigeConfirmacao() throws Exception {
    long id = threeInstallmentsWithOnePaid().get("id").asLong();

    api.call(ana, HttpMethod.DELETE, "/transaction-groups/" + id, null)
        .andExpect(status().isBadRequest());
    api.call(ana, HttpMethod.DELETE, "/transaction-groups/" + id + "?confirm=false", null)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='confirm')]").exists());
    assertThat(api.get(ana, "/transaction-groups/" + id).get("transactions")).hasSize(3);
  }

  @Test
  void excluirRemoveAsPendentesEPreservaAsPagas() throws Exception {
    long id = threeInstallmentsWithOnePaid().get("id").asLong();

    api.call(ana, HttpMethod.DELETE, "/transaction-groups/" + id + "?confirm=true", null)
        .andExpect(status().isNoContent());

    JsonNode remaining = api.get(ana, "/transaction-groups/" + id);
    assertThat(remaining.get("transactions")).hasSize(1);
    assertThat(remaining.get("transactions").get(0).get("status").asText()).isEqualTo("PAID");
  }

  @Test
  void semParcelasPagasOGrupoSomeInteiro() throws Exception {
    Map<String, Object> body =
        api.groupBody(
            "INSTALLMENT", "Notebook", "300.00", checking, shopping, "2026-11-01", "2026-11-10");
    body.put("totalInstallments", 3);
    long id = api.createGroup(ana, body).get("id").asLong();

    api.call(ana, HttpMethod.DELETE, "/transaction-groups/" + id + "?confirm=true", null)
        .andExpect(status().isNoContent());

    api.call(ana, HttpMethod.GET, "/transaction-groups/" + id, null)
        .andExpect(status().isNotFound());
  }

  @Test
  void fixoComPagasEEncerradoNoUltimoMesPagoESeguePreservado() throws Exception {
    JsonNode fixed =
        api.createGroup(
            ana,
            api.fixedBody("Internet", "99.90", checking, shopping, "2026-11-05", "2026-11-05"));
    long id = fixed.get("id").asLong();
    long paidDecember = fixed.get("transactions").get(1).get("id").asLong();
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + paidDecember + "/pay",
            Map.of("paymentDate", "2026-12-05"))
        .andExpect(status().isOk());

    api.call(ana, HttpMethod.DELETE, "/transaction-groups/" + id + "?confirm=true", null)
        .andExpect(status().isNoContent());

    JsonNode after = api.get(ana, "/transaction-groups/" + id);
    assertThat(after.get("transactions")).hasSize(1);
    assertThat(after.get("endMonth").asText()).isEqualTo("2026-12");
    // Com o tempo avançado a rotina não pode voltar a gerar ocorrências do grupo encerrado
    // (o token de acesso expira com o relógio, por isso a conferência é feita direto no banco).
    clock.advance(Duration.ofDays(90));
    job.topUp();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM transactions WHERE group_id = ?", Integer.class, id))
        .isEqualTo(1);
  }
}
