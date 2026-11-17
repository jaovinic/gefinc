package com.jvtech.gefinc.admin.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Testes de anonimização e conformidade LGPD na remoção definitiva (US10, T136, SC-012, SC-021):
 * remoção em cascata dos dados financeiros, ausência de e-mail/nome/IP em logs, preservação da
 * justificativa do administrador e exibição de rótulo anônimo na auditoria e envios.
 */
class ErasureAnonymizationIT extends IntegrationTestBase {

  @Autowired private Pseudonymizer pseudonymizer;

  private TestUsers testUsers;
  private TestApi testApi;
  private TestUser admin;
  private SeededUser adminRow;
  private long reasonId;

  @BeforeEach
  void setUp() throws Exception {
    testUsers = new TestUsers(mockMvc, objectMapper);
    testApi = new TestApi(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm-anon@teste.com");
    String token =
        testUsers.login("adm-anon@teste.com", TestUsers.PASSWORD).get("accessToken").asText();
    admin = new TestUser(adminRow.id(), adminRow.email(), token);
    reasonId =
        jdbc.queryForObject(
            "SELECT id FROM deletion_reasons WHERE active = true LIMIT 1", Long.class);
  }

  private String json(Object body) throws Exception {
    return objectMapper.writeValueAsString(body);
  }

  @Test
  void aoExecutarExclusaoDadosFinanceirosESensiveisSomemERotuloViraAnonimo() throws Exception {
    TestUser vitima = testUsers.registerAndLogin("vitima-lgpd@teste.com");

    // Semeia contas e finanças para a vítima
    testApi.checking(vitima, "Conta Principal");
    testApi.cash(vitima, "Carteira Principal");

    // Semeia envio de e-mail (para constar em email_deliveries com o e-mail dela)
    jdbc.update(
        "INSERT INTO email_deliveries (kind, recipient_email, recipient_ref, user_id, status, attempts)"
            + " VALUES ('PASSWORD_RESET', ?, 'ref-vitima', ?, 'SENT', 1)",
        vitima.email(),
        vitima.id());

    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM email_deliveries WHERE user_id = ? AND recipient_email IS NOT NULL",
                Long.class,
                vitima.id()))
        .isGreaterThanOrEqualTo(1);

    // Executa exclusão imediata
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Exclusão solicitada com base no Art. 18 da LGPD",
            "mode",
            "IMMEDIATE",
            "confirmEmail",
            vitima.email(),
            "password",
            TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + vitima.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))
        .andExpect(status().isOk());

    // 1. O usuário não existe mais
    assertThat(
            jdbc.queryForObject("SELECT count(*) FROM users WHERE id = ?", Long.class, vitima.id()))
        .isZero();

    // 2. Dados financeiros foram apagados em cascata
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM accounts WHERE user_id = ?", Long.class, vitima.id()))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM categories WHERE user_id = ?", Long.class, vitima.id()))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM transaction_groups WHERE user_id = ?",
                Long.class,
                vitima.id()))
        .isZero();

    // 3. Sessões foram apagadas em cascata
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM auth_sessions WHERE user_id = ?", Long.class, vitima.id()))
        .isZero();

    // 4. audit_log_client (IPs da vítima) foram apagados em cascata
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log_client WHERE user_id = ?", Long.class, vitima.id()))
        .isZero();

    // 5. email_deliveries teve o endereço recipient_email zerado para este user_id
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM email_deliveries WHERE user_id = ? AND recipient_email IS NOT NULL",
                Long.class,
                vitima.id()))
        .isZero();

    // 6. audit_log preservou a justificativa e o registro
    String justification =
        jdbc.queryForObject(
            "SELECT reason_text FROM audit_log WHERE target_user_id = ? AND action = 'ACCOUNT_ERASED'",
            String.class,
            vitima.id());
    assertThat(justification).isEqualTo("Exclusão solicitada com base no Art. 18 da LGPD");

    // 7. A consulta de auditoria no painel agora exibe o rótulo anônimo
    String expectedLabel = pseudonymizer.anonymousLabel(vitima.id());

    mockMvc
        .perform(
            get("/admin/audit?targetUserId=" + vitima.id())
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[0].target.label").value(expectedLabel))
        .andExpect(
            jsonPath("$.content[0].reason")
                .value("Exclusão solicitada com base no Art. 18 da LGPD"));
  }
}
