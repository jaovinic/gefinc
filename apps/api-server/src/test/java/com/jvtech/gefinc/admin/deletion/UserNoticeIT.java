package com.jvtech.gefinc.admin.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Testes de integração para a User Story 12 (T150): Aviso de exclusão dentro do aplicativo. Cobre
 * exibição de aviso no login com exclusão pendente administrativa vs usuário, proteção contra
 * enumeração, antecipação, exclusão imediata, entrega única de avisos de cancelamento nas variantes
 * ACTIVE, STILL_BLOCKED e USER_REQUEST_CONTINUES, e endpoint de dispensa.
 */
class UserNoticeIT extends IntegrationTestBase {

  private static final DateTimeFormatter DATE_FORMATTER =
      DateTimeFormatter.ofPattern("dd/MM/yyyy").withZone(ZoneId.of("America/Sao_Paulo"));

  private TestUsers testUsers;
  private TestUser admin;
  private SeededUser adminRow;
  private long reasonId;
  private String reasonMessage;

  @BeforeEach
  void setUp() throws Exception {
    testUsers = new TestUsers(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm-notice@teste.com");
    String token =
        testUsers.login("adm-notice@teste.com", TestUsers.PASSWORD).get("accessToken").asText();
    admin = new TestUser(adminRow.id(), adminRow.email(), token);

    Map<String, Object> reason =
        jdbc.queryForMap("SELECT id, message FROM deletion_reasons WHERE active = true LIMIT 1");
    reasonId = ((Number) reason.get("id")).longValue();
    reasonMessage = (String) reason.get("message");
  }

  private String json(Object body) throws Exception {
    return objectMapper.writeValueAsString(body);
  }

  @Test
  void loginComExclusaoAgendadaPorAdminResponde423ComCamposCompletosEMotivoFixado()
      throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-admin-del@teste.com");

    String justification =
        "Esta é uma justificativa sigilosa do administrador que nunca deve vazar.";
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            justification,
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

    Instant dueAt =
        jdbc.queryForObject(
                "SELECT deletion_due_at FROM users WHERE id = ?", Timestamp.class, alvo.id())
            .toInstant();
    LocalDate expectedDate = LocalDate.ofInstant(dueAt, ZoneId.of("America/Sao_Paulo"));

    // Login com credenciais corretas
    var loginResp =
        mockMvc
            .perform(
                post("/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("email", alvo.email(), "password", TestUsers.PASSWORD))))
            .andExpect(status().isLocked())
            .andExpect(jsonPath("$.code").value("ACCOUNT_DELETION_PENDING"))
            .andExpect(jsonPath("$.deletionDate").value(expectedDate.toString()))
            .andExpect(jsonPath("$.origin").value("ADMIN"))
            .andExpect(jsonPath("$.canCancel").value(false))
            .andExpect(jsonPath("$.reasonMessage").value(reasonMessage))
            .andExpect(jsonPath("$.supportHint").isNotEmpty())
            .andExpect(jsonPath("$.accessToken").doesNotExist())
            .andReturn()
            .getResponse()
            .getContentAsString();

    // A justificativa livre NUNCA pode vazar
    assertThat(loginResp).doesNotContain(justification);
  }

  @Test
  void loginComCredenciaisIncorretasResponde401SemRevelarSituacaoNemConsumirAviso()
      throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-enum-protect@teste.com");

    // Agenda exclusão e cancela para criar aviso
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Teste de enumeração de contas",
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

    mockMvc
        .perform(
            delete("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isNoContent());

    // Senha errada
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json(Map.of("email", alvo.email(), "password", "senha-completamente-errada"))))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
        .andExpect(jsonPath("$.origin").doesNotExist())
        .andExpect(jsonPath("$.canCancel").doesNotExist())
        .andExpect(jsonPath("$.notices").doesNotExist());

    // O aviso NÃO foi consumido (delivered_at continua nulo)
    Long deliveredCount =
        jdbc.queryForObject(
            "SELECT count(*) FROM user_notices WHERE user_id = ? AND delivered_at IS NOT NULL",
            Long.class,
            alvo.id());
    assertThat(deliveredCount).isZero();
  }

  @Test
  void loginComExclusaoAntecipadaMostraPrazoNovo() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-antecipacao@teste.com");

    // Autoatendimento do usuário (30 dias)
    mockMvc
        .perform(
            post("/auth/account-deletion")
                .header(HttpHeaders.AUTHORIZATION, alvo.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("password", TestUsers.PASSWORD))))
        .andExpect(status().isAccepted());

    // Admin antecipa para 10 dias
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Antecipação por violação de termos",
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

    Instant newDueAt =
        jdbc.queryForObject(
                "SELECT deletion_due_at FROM users WHERE id = ?", Timestamp.class, alvo.id())
            .toInstant();
    LocalDate expectedDate = LocalDate.ofInstant(newDueAt, ZoneId.of("America/Sao_Paulo"));

    // Login mostra novo prazo, origem ADMIN e canCancel = false
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", alvo.email(), "password", TestUsers.PASSWORD))))
        .andExpect(status().isLocked())
        .andExpect(jsonPath("$.code").value("ACCOUNT_DELETION_PENDING"))
        .andExpect(jsonPath("$.deletionDate").value(expectedDate.toString()))
        .andExpect(jsonPath("$.origin").value("ADMIN"))
        .andExpect(jsonPath("$.canCancel").value(false))
        .andExpect(jsonPath("$.reasonMessage").value(reasonMessage));
  }

  @Test
  void exclusaoImediataNaoGeraJanelaDeAvisoNoApp() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-imediata@teste.com");

    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Exclusão imediata sem carência",
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

    // Conta não existe mais; login responde 401 comum
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", alvo.email(), "password", TestUsers.PASSWORD))))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
        .andExpect(jsonPath("$.origin").doesNotExist());
  }

  @Test
  void cancelamentoExclusaoContaAtivaEntregaAvisoUmaVezNoMe() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-cancel-active@teste.com");

    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Exclusão agendada que será cancelada",
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

    // Usuário faz login normalmente
    var loginJson = testUsers.login(alvo.email(), TestUsers.PASSWORD);
    String token = loginJson.get("accessToken").asText();

    // Primeira chamada a GET /auth/me entrega o aviso
    mockMvc
        .perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.notices[0].kind").value("DELETION_CANCELED"))
        .andExpect(jsonPath("$.notices[0].variant").value("ACTIVE"))
        .andExpect(
            jsonPath("$.notices[0].message")
                .value(
                    "A exclusão administrativa desta conta foi cancelada. Sua conta segue ativa."))
        .andExpect(jsonPath("$.notices[0].originalDeletionDate").doesNotExist());

    // Verifica que delivered_at foi registrado
    Long deliveredCount =
        jdbc.queryForObject(
            "SELECT count(*) FROM user_notices WHERE user_id = ? AND delivered_at IS NOT NULL",
            Long.class,
            alvo.id());
    assertThat(deliveredCount).isEqualTo(1);

    // Segunda chamada a GET /auth/me NÃO entrega mais o aviso (entrega única)
    mockMvc
        .perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.notices").doesNotExist());
  }

  @Test
  void cancelamentoExclusaoContaPreviamenteSuspensaEntregaAvisoNo403() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-cancel-suspended@teste.com");

    // Suspende a conta
    jdbc.update(
        "UPDATE users SET suspended_at = ? WHERE id = ?",
        Timestamp.from(clock.instant()),
        alvo.id());

    // Agenda exclusão
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Exclusão de conta suspensa que será cancelada",
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

    // Cancela exclusão (conta continua suspensa)
    mockMvc
        .perform(
            delete("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isNoContent());

    // Primeiro login com credenciais corretas: 403 ACCOUNT_SUSPENDED com o aviso STILL_BLOCKED
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", alvo.email(), "password", TestUsers.PASSWORD))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"))
        .andExpect(jsonPath("$.notices[0].kind").value("DELETION_CANCELED"))
        .andExpect(jsonPath("$.notices[0].variant").value("STILL_BLOCKED"))
        .andExpect(
            jsonPath("$.notices[0].message")
                .value(
                    "A exclusão administrativa desta conta foi cancelada. Sua conta continua suspensa; entre em contato com o suporte."));

    // DB: delivered_at preenchido
    Long deliveredCount =
        jdbc.queryForObject(
            "SELECT count(*) FROM user_notices WHERE user_id = ? AND delivered_at IS NOT NULL",
            Long.class,
            alvo.id());
    assertThat(deliveredCount).isEqualTo(1);

    // Segundo login com credenciais corretas: 403 ACCOUNT_SUSPENDED sem notices
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", alvo.email(), "password", TestUsers.PASSWORD))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"))
        .andExpect(jsonPath("$.notices").doesNotExist());
  }

  @Test
  void cancelamentoAntecipacaoRestauraAgendamentoUsuarioEEntregaAvisoNo423() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-cancel-antecipacao@teste.com");

    // Autoatendimento do usuário (30 dias)
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
    LocalDate expectedDate = LocalDate.ofInstant(originalDueAt, ZoneId.of("America/Sao_Paulo"));
    String formattedDate = DATE_FORMATTER.format(originalDueAt);

    // Administrador antecipa
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Antecipação administrativa temporária",
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

    // Administrador cancela a antecipação
    mockMvc
        .perform(
            delete("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isNoContent());

    // Login com credenciais corretas: 423 com aviso USER_REQUEST_CONTINUES
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", alvo.email(), "password", TestUsers.PASSWORD))))
        .andExpect(status().isLocked())
        .andExpect(jsonPath("$.code").value("ACCOUNT_DELETION_PENDING"))
        .andExpect(jsonPath("$.origin").value("USER"))
        .andExpect(jsonPath("$.canCancel").value(true))
        .andExpect(jsonPath("$.deletionDate").value(expectedDate.toString()))
        .andExpect(jsonPath("$.notices[0].kind").value("DELETION_CANCELED"))
        .andExpect(jsonPath("$.notices[0].variant").value("USER_REQUEST_CONTINUES"))
        .andExpect(jsonPath("$.notices[0].originalDeletionDate").value(expectedDate.toString()))
        .andExpect(
            jsonPath("$.notices[0].message")
                .value(
                    "A exclusão administrativa desta conta foi cancelada. A sua solicitação de exclusão continua agendada para "
                        + formattedDate
                        + "."));

    // DB: delivered_at preenchido
    Long deliveredCount =
        jdbc.queryForObject(
            "SELECT count(*) FROM user_notices WHERE user_id = ? AND delivered_at IS NOT NULL",
            Long.class,
            alvo.id());
    assertThat(deliveredCount).isEqualTo(1);

    // Segundo login: 423 sem notices
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", alvo.email(), "password", TestUsers.PASSWORD))))
        .andExpect(status().isLocked())
        .andExpect(jsonPath("$.code").value("ACCOUNT_DELETION_PENDING"))
        .andExpect(jsonPath("$.notices").doesNotExist());
  }

  @Test
  void dispensaDeAvisoAtualizaDismissedAtERecusaOutroUsuario() throws Exception {
    TestUser alvoA = testUsers.registerAndLogin("alvo-a-dismiss@teste.com");
    TestUser alvoB = testUsers.registerAndLogin("alvo-b-dismiss@teste.com");

    // Cria exclusão e cancela para alvoA
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Exclusão para gerar notice",
            "mode",
            "GRACE",
            "days",
            15,
            "confirmEmail",
            alvoA.email(),
            "password",
            TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + alvoA.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))
        .andExpect(status().isOk());

    mockMvc
        .perform(
            delete("/admin/users/" + alvoA.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isNoContent());

    Long noticeId =
        jdbc.queryForObject(
            "SELECT id FROM user_notices WHERE user_id = ? ORDER BY id DESC LIMIT 1",
            Long.class,
            alvoA.id());
    assertThat(noticeId).isNotNull();

    // 1. Chamada não autenticada responde 401
    mockMvc
        .perform(post("/auth/notices/" + noticeId + "/dismiss"))
        .andExpect(status().isUnauthorized());

    // 2. Alvo B tenta dispensar aviso do Alvo A -> 404 NOT_FOUND
    mockMvc
        .perform(
            post("/auth/notices/" + noticeId + "/dismiss")
                .header(HttpHeaders.AUTHORIZATION, alvoB.bearer()))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"));

    // 3. Alvo A faz login (sua sessão antiga caiu com a exclusão) e dispensa seu próprio aviso ->
    // 204 NO_CONTENT
    String tokenA = testUsers.login(alvoA.email(), TestUsers.PASSWORD).get("accessToken").asText();

    mockMvc
        .perform(
            post("/auth/notices/" + noticeId + "/dismiss")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA))
        .andExpect(status().isNoContent());

    // DB: dismissed_at preenchido
    Timestamp dismissedAt =
        jdbc.queryForObject(
            "SELECT dismissed_at FROM user_notices WHERE id = ?", Timestamp.class, noticeId);
    assertThat(dismissedAt).isNotNull();
  }
}
