package com.jvtech.gefinc.admin.email;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

/**
 * {@code GET /admin/email/deliveries} (T110, US7): ordem, cursor, filtros, janela de 90 dias,
 * rótulos do destinatário e ausência de dados sensíveis.
 */
class EmailDeliveryIT extends IntegrationTestBase {

  private String adminBearer;
  private String commonBearer;
  private SeededUser ana;

  @BeforeEach
  void init() throws Exception {
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    SeededUser admin = seed.createAdmin("adm@teste.com");
    ana = seed.createUser("ana@teste.com");
    seed.createUser("comum@teste.com");
    adminBearer =
        "Bearer " + users.login(admin.email(), TestUsers.PASSWORD).get("accessToken").asText();
    commonBearer =
        "Bearer " + users.login("comum@teste.com", TestUsers.PASSWORD).get("accessToken").asText();
  }

  private long insert(
      Instant at,
      String kind,
      String email,
      String ref,
      Long userId,
      String status,
      String reason) {
    return jdbc.queryForObject(
        "INSERT INTO email_deliveries (created_at, kind, recipient_email, recipient_ref, user_id,"
            + " status, failure_reason) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
        Long.class,
        Timestamp.from(at),
        kind,
        email,
        ref,
        userId,
        status,
        reason);
  }

  private ResultActions list(String query) throws Exception {
    return mockMvc.perform(
        get("/admin/email/deliveries" + query).header(HttpHeaders.AUTHORIZATION, adminBearer));
  }

  private JsonNode body(String query) throws Exception {
    MvcResult result =
        list(query).andExpect(status().isOk()).andExpect(matchesContract()).andReturn();
    return objectMapper.readTree(result.getResponse().getContentAsString());
  }

  @Test
  void ordenaPorDataEIdDecrescentesEPaginaSemRepetirComEmpates() throws Exception {
    Instant tie = clock.instant().minus(Duration.ofHours(1));
    List<Long> expected = new ArrayList<>();
    for (int i = 0; i < 5; i++) {
      expected.add(insert(tie, "TEST", "x@teste.com", "ref" + i, null, "SENT", null));
    }
    long newest = insert(clock.instant(), "TEST", "x@teste.com", "refn", null, "SENT", null);
    expected.add(newest);
    expected.sort((a, b) -> Long.compare(b, a));
    expected.remove(newest);
    expected.add(0, newest);

    List<Long> seen = new ArrayList<>();
    String cursor = null;
    do {
      JsonNode page = body("?limit=2" + (cursor == null ? "" : "&cursor=" + cursor));
      page.get("content").forEach(n -> seen.add(n.get("id").asLong()));
      cursor = page.hasNonNull("nextCursor") ? page.get("nextCursor").asText() : null;
    } while (cursor != null);

    assertThat(seen).containsExactlyElementsOf(expected);
  }

  @Test
  void filtraPorStatusKindEAmbos() throws Exception {
    Instant now = clock.instant();
    insert(now, "TEST", "a@teste.com", "r1", null, "SENT", null);
    insert(now, "TEST", "a@teste.com", "r2", null, "FAILED", "OTHER");
    insert(now, "PASSWORD_RESET", "a@teste.com", "r3", null, "FAILED", "TIMEOUT");
    insert(now, "INVITATION", "a@teste.com", "r4", null, "SENT", null);

    assertThat(body("?status=FAILED").get("content")).hasSize(2);
    assertThat(body("?kind=TEST").get("content")).hasSize(2);
    JsonNode both = body("?status=FAILED&kind=PASSWORD_RESET").get("content");
    assertThat(both).hasSize(1);
    assertThat(both.get(0).get("failureReason").asText()).isEqualTo("TIMEOUT");
  }

  @Test
  void entradasInvalidasRespondem422ComOCampo() throws Exception {
    list("?status=sent")
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[0].field").value("status"));
    list("?status=FAILED%00").andExpect(status().isUnprocessableEntity());
    list("?kind=test")
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[0].field").value("kind"));
    list("?kind=X%00").andExpect(status().isUnprocessableEntity());
    list("?cursor=lixo!")
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[0].field").value("cursor"));
    list("?cursor=a%00b").andExpect(status().isUnprocessableEntity());
    list("?limit=0")
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[0].field").value("limit"));
    list("?limit=101").andExpect(status().isUnprocessableEntity());
  }

  @Test
  void janelaDe90DiasEscondeOMaisAntigo() throws Exception {
    Instant now = clock.instant();
    insert(now.minus(Duration.ofDays(89)), "TEST", "a@teste.com", "r1", null, "SENT", null);
    insert(now.minus(Duration.ofDays(91)), "TEST", "a@teste.com", "r2", null, "SENT", null);

    assertThat(body("").get("content")).hasSize(1);
  }

  @Test
  void rotulosEmClaroQuandoContaExisteEAnonimoQuandoRemovida() throws Exception {
    Instant now = clock.instant();
    insert(now, "TEST", ana.email(), "refana00", ana.id(), "SENT", null);
    insert(now.minusSeconds(1), "TEST", "removida@teste.com", "refgone0", 987654L, "SENT", null);
    insert(now.minusSeconds(2), "TEST", null, "abcdef0123456789", null, "SENT", null);
    insert(
        now.minusSeconds(3), "INVITATION", "convidado@teste.com", "refinv00", null, "SENT", null);

    JsonNode content = body("").get("content");

    assertThat(content.get(0).get("recipient").get("label").asText()).isEqualTo(ana.email());
    assertThat(content.get(0).get("recipient").get("userId").asLong()).isEqualTo(ana.id());
    JsonNode removed = content.get(1).get("recipient");
    assertThat(removed.get("label").asText()).startsWith("anônimo-");
    assertThat(removed.get("label").asText()).doesNotContain("removida@teste.com");
    assertThat(content.get(2).get("recipient").get("label").asText()).isEqualTo("anônimo-abcdef01");
    assertThat(content.get(2).get("recipient").has("userId")).isFalse();
    assertThat(content.get(3).get("recipient").get("label").asText())
        .isEqualTo("convidado@teste.com");
  }

  @Test
  void respostaNaoTrazRefCorpoLinkTokenCodigoNemAssunto() throws Exception {
    insert(clock.instant(), "PASSWORD_RESET", ana.email(), "refsecreta0", ana.id(), "SENT", null);

    String raw = list("").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

    assertThat(raw)
        .doesNotContain("refsecreta0")
        .doesNotContainIgnoringCase("recipientRef")
        .doesNotContainIgnoringCase("body")
        .doesNotContainIgnoringCase("link")
        .doesNotContainIgnoringCase("token")
        .doesNotContainIgnoringCase("code")
        .doesNotContainIgnoringCase("subject");
  }

  @Test
  void comumRecebe403EVisitanteRecebe401() throws Exception {
    mockMvc
        .perform(get("/admin/email/deliveries").header(HttpHeaders.AUTHORIZATION, commonBearer))
        .andExpect(status().isForbidden());
    mockMvc.perform(get("/admin/email/deliveries")).andExpect(status().isUnauthorized());
  }
}
