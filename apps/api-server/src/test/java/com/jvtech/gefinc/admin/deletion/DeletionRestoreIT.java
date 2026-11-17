package com.jvtech.gefinc.admin.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Testes de restauração no cancelamento de exclusão pelo administrador (US10, T134): restaura o
 * estado exato (ativa continua ativa; suspensa continua suspensa; antecipação volta ao agendamento
 * original com origem USER), 409 DELETION_ALREADY_EXECUTED e aviso no app.
 */
class DeletionRestoreIT extends IntegrationTestBase {

  private TestUsers testUsers;
  private TestUser admin;
  private SeededUser adminRow;
  private long reasonId;

  @BeforeEach
  void setUp() throws Exception {
    testUsers = new TestUsers(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm-restore@teste.com");
    String token =
        testUsers.login("adm-restore@teste.com", TestUsers.PASSWORD).get("accessToken").asText();
    admin = new TestUser(adminRow.id(), adminRow.email(), token);
    reasonId =
        jdbc.queryForObject(
            "SELECT id FROM deletion_reasons WHERE active = true LIMIT 1", Long.class);
  }

  private String json(Object body) throws Exception {
    return objectMapper.writeValueAsString(body);
  }

  @Test
  void cancelarExclusaoDeContaAtivaRestauraAcessoEGravaAvisoNoApp() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-ativa@teste.com");

    // Solicita exclusão com prazo
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Exclusão que será cancelada",
            "mode",
            "GRACE",
            "days",
            15,
            "confirmEmail",
            alvo.email(),
            "password",
            TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))
        .andExpect(status().isOk());

    // Cancela a exclusão
    mockMvc
        .perform(
            delete("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isNoContent());

    // Conta volta a ficar ativa e sem dados de exclusão
    Map<String, Object> user =
        jdbc.queryForMap(
            "SELECT deletion_requested_at, deletion_due_at, deletion_origin, suspended_at FROM users WHERE id = ?",
            alvo.id());
    assertThat(user.get("deletion_requested_at")).isNull();
    assertThat(user.get("deletion_due_at")).isNull();
    assertThat(user.get("deletion_origin")).isNull();
    assertThat(user.get("suspended_at")).isNull();

    // Aviso gravado em user_notices
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM user_notices WHERE user_id = ? AND kind = 'DELETION_CANCELED'",
                Long.class,
                alvo.id()))
        .isEqualTo(1);

    // Auditoria registrou DELETION_CANCELED
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE target_user_id = ? AND action = 'DELETION_CANCELED'",
                Long.class,
                alvo.id()))
        .isEqualTo(1);
  }

  @Test
  void cancelarExclusaoDeContaQueEstavaSuspensaMantemASuspensao() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-suspensa@teste.com");

    // Suspende a conta previamente
    Instant suspendedAt = clock.instant();
    jdbc.update(
        "UPDATE users SET suspended_at = ? WHERE id = ?",
        java.sql.Timestamp.from(suspendedAt),
        alvo.id());

    // Solicita exclusão
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Exclusão de conta já suspensa",
            "mode",
            "GRACE",
            "days",
            15,
            "confirmEmail",
            alvo.email(),
            "password",
            TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))
        .andExpect(status().isOk());

    // Cancela a exclusão
    mockMvc
        .perform(
            delete("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isNoContent());

    // Exclusão foi removida, MAS A CONTA CONTINUA SUSPENSA
    Map<String, Object> user =
        jdbc.queryForMap(
            "SELECT deletion_requested_at, suspended_at FROM users WHERE id = ?", alvo.id());
    assertThat(user.get("deletion_requested_at")).isNull();
    assertThat(user.get("suspended_at")).isNotNull();
  }

  @Test
  void cancelarAntecipacaoRestauraAgendamentoOriginalDoUsuario() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-antecipado@teste.com");

    // Usuário agenda pelo autoatendimento (30 dias)
    mockMvc
        .perform(
            post("/auth/account-deletion")
                .header(HttpHeaders.AUTHORIZATION, alvo.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("password", TestUsers.PASSWORD))))
        .andExpect(status().isAccepted());

    Instant originalDueAt =
        jdbc.queryForObject(
                "SELECT deletion_due_at FROM users WHERE id = ?", Timestamp.class, alvo.id())
            .toInstant();

    // Administrador antecipa para 10 dias
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Antecipando o prazo do usuário",
            "mode",
            "GRACE",
            "days",
            10,
            "confirmEmail",
            alvo.email(),
            "password",
            TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))
        .andExpect(status().isOk());

    assertThat(
            jdbc.queryForObject(
                "SELECT deletion_origin FROM users WHERE id = ?", String.class, alvo.id()))
        .isEqualTo("ADMIN");

    // Administrador cancela a antecipação
    mockMvc
        .perform(
            delete("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isNoContent());

    // Conta volta ao agendamento original: data original e origem USER!
    Map<String, Object> user =
        jdbc.queryForMap(
            "SELECT deletion_requested_at, deletion_due_at, deletion_origin FROM users WHERE id = ?",
            alvo.id());
    assertThat(user.get("deletion_origin")).isEqualTo("USER");
    assertThat(((java.sql.Timestamp) user.get("deletion_due_at")).toInstant())
        .isEqualTo(originalDueAt);

    // E o usuário volta a conseguir cancelar por conta própria!
    mockMvc
        .perform(
            post("/auth/account-deletion/cancel")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", alvo.email(), "password", TestUsers.PASSWORD))))
        .andExpect(status().isNoContent());

    assertThat(
            jdbc.queryForObject(
                "SELECT deletion_requested_at FROM users WHERE id = ?", Object.class, alvo.id()))
        .isNull();
  }

  @Test
  void cancelarExclusaoJaExecutadaRetorna409DeletionAlreadyExecuted() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-executado@teste.com");

    // Exclusão imediata (já executada)
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Imediata para testar cancelamento",
            "mode",
            "IMMEDIATE",
            "confirmEmail",
            alvo.email(),
            "password",
            TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))
        .andExpect(status().isOk());

    // Tentar cancelar a exclusão já executada
    mockMvc
        .perform(
            delete("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("DELETION_ALREADY_EXECUTED"));
  }
}
