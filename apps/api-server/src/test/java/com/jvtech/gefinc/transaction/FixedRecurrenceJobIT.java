package com.jvtech.gefinc.transaction;

import static org.assertj.core.api.Assertions.assertThat;

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

class FixedRecurrenceJobIT extends IntegrationTestBase {

  @Autowired private FixedRecurrenceJob job;

  private TestApi api;
  private TestUser ana;
  private long checking;
  private long food;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    checking = api.checking(ana, "Itaú");
    food = api.category(ana, "Alimentação");
  }

  private int count(long groupId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM transactions WHERE group_id = ?", Integer.class, groupId);
  }

  private String lastMonth(long groupId) {
    return jdbc.queryForObject(
        "SELECT to_char(max(reference_month), 'YYYY-MM') FROM transactions WHERE group_id = ?",
        String.class,
        groupId);
  }

  @Test
  void completaAJanelaDeDozeMesesAcompanhandoOTempoEEIdempotente() throws Exception {
    long id =
        api.createGroup(
                ana, api.fixedBody("Internet", "99.90", checking, food, "2026-11-05", "2026-11-05"))
            .get("id")
            .asLong();
    assertThat(count(id)).isEqualTo(12);
    assertThat(lastMonth(id)).isEqualTo("2027-10");

    assertThat(job.topUp()).isZero(); // nada a completar ainda

    clock.advance(Duration.ofDays(61)); // 2027-01-10: horizonte vai a 2027-12
    assertThat(job.topUp()).isEqualTo(2);
    assertThat(count(id)).isEqualTo(14);
    assertThat(lastMonth(id)).isEqualTo("2027-12");

    assertThat(job.topUp()).isZero(); // idempotente
    assertThat(count(id)).isEqualTo(14);
  }

  @Test
  void novasOcorrenciasUsamOValorAtualDoGrupo() throws Exception {
    JsonNode group =
        api.createGroup(
            ana, api.fixedBody("Internet", "99.90", checking, food, "2026-11-05", "2026-11-05"));
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups/" + group.get("id").asLong() + "/amount-changes",
            Map.of("fromMonth", "2026-11", "amount", "110.00"))
        .andReturn();

    clock.advance(Duration.ofDays(61));
    job.topUp();

    String amount =
        jdbc.queryForObject(
            "SELECT amount::text FROM transactions WHERE group_id = ? ORDER BY installment_number DESC LIMIT 1",
            String.class,
            group.get("id").asLong());
    assertThat(amount).isEqualTo("110.00");
  }

  @Test
  void ignoraGruposEncerradosEGruposDeContaInativa() throws Exception {
    long ended =
        api.createGroup(
                ana, api.fixedBody("Antigo", "10.00", checking, food, "2026-11-05", "2026-11-05"))
            .get("id")
            .asLong();
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups/" + ended + "/end",
            Map.of("endMonth", "2027-02"))
        .andReturn();
    long inactiveAccount = api.checking(ana, "Conta velha");
    long onInactive =
        api.createGroup(
                ana,
                api.fixedBody("Parado", "10.00", inactiveAccount, food, "2026-11-05", "2026-11-05"))
            .get("id")
            .asLong();
    JsonNode account = api.get(ana, "/accounts/" + inactiveAccount);
    api.call(
            ana,
            HttpMethod.PUT,
            "/accounts/" + inactiveAccount,
            Map.of(
                "name",
                "Conta velha",
                "type",
                "CHECKING",
                "active",
                false,
                "version",
                account.get("version").asLong()))
        .andReturn();
    int endedBefore = count(ended);
    int inactiveBefore = count(onInactive);

    clock.advance(Duration.ofDays(120));
    job.topUp();

    assertThat(count(ended)).isEqualTo(endedBefore);
    assertThat(count(onInactive)).isEqualTo(inactiveBefore);
  }
}
