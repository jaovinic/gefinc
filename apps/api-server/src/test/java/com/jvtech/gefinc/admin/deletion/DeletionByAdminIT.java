package com.jvtech.gefinc.admin.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.sql.Connection;
import java.sql.Statement;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Testes de integração da solicitação de exclusão por administrador (US10, T133): com prazo,
 * imediata, validações de entrada, salvaguardas (raiz, si mesmo, último admin), reautenticação e
 * resiliência com SMTP fora do ar (sempre prossegue).
 */
class DeletionByAdminIT extends IntegrationTestBase {

  @Autowired private DataSource dataSource;

  private TestUsers testUsers;
  private TestUser admin;
  private SeededUser adminRow;
  private long reasonId;

  @BeforeEach
  void setUp() throws Exception {
    testUsers = new TestUsers(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm-del@teste.com");
    String token =
        testUsers.login("adm-del@teste.com", TestUsers.PASSWORD).get("accessToken").asText();
    admin = new TestUser(adminRow.id(), adminRow.email(), token);
    reasonId =
        jdbc.queryForObject(
            "SELECT id FROM deletion_reasons WHERE active = true LIMIT 1", Long.class);
  }

  private String json(Object body) throws Exception {
    return objectMapper.writeValueAsString(body);
  }

  @Test
  void exclusaoComPrazoValidoBloqueiaAcessoEAgendaExecucao() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-prazo@teste.com");
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Exclusão solicitada conforme processo interno 1020",
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
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("SCHEDULED"))
        .andExpect(jsonPath("$.dueAt").isNotEmpty())
        .andExpect(jsonPath("$.noticeState").value("SENT"));

    // Justificativa está APENAS na auditoria, NUNCA no livro-razão
    String auditReason =
        jdbc.queryForObject(
            "SELECT reason_text FROM audit_log WHERE target_user_id = ? AND action = 'DELETION_REQUESTED'",
            String.class,
            alvo.id());
    assertThat(auditReason).isEqualTo("Exclusão solicitada conforme processo interno 1020");

    Long countInLedger =
        jdbc.queryForObject(
            "SELECT count(*) FROM account_deletion_requests WHERE user_id = ? AND status = 'SCHEDULED'",
            Long.class,
            alvo.id());
    assertThat(countInLedger).isEqualTo(1);

    // Tokens anteriores do alvo foram invalidados
    mockMvc
        .perform(post("/auth/logout").header(HttpHeaders.AUTHORIZATION, alvo.bearer()))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void exclusaoImediataApagaOUsuarioAntesDeResponder() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-imediato@teste.com");
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Remoção imediata por violação flagrante",
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
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("EXECUTED"))
        .andExpect(jsonPath("$.dueAt").doesNotExist())
        .andExpect(jsonPath("$.noticeState").value("SENT"));

    // O usuário foi removido do banco
    assertThat(
            jdbc.queryForObject("SELECT count(*) FROM users WHERE id = ?", Long.class, alvo.id()))
        .isZero();

    // Auditoria registrou ACCOUNT_ERASED
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE target_user_id = ? AND action = 'ACCOUNT_ERASED'",
                Long.class,
                alvo.id()))
        .isEqualTo(1);
  }

  @Test
  void prazoForaDeUmATrintaRetorna422() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-dias@teste.com");
    var bodyZero =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Justificativa válida",
            "mode",
            "GRACE",
            "days",
            0,
            "confirmEmail",
            alvo.email(),
            "password",
            TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(bodyZero)))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

    var bodyTrintaEUm =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Justificativa válida",
            "mode",
            "GRACE",
            "days",
            31,
            "confirmEmail",
            alvo.email(),
            "password",
            TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(bodyTrintaEUm)))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
  }

  @Test
  void motivoInativoRetorna422() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-inativo@teste.com");

    // Desativa um motivo
    jdbc.update("UPDATE deletion_reasons SET active = false WHERE id = ?", reasonId);

    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Justificativa de teste",
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
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
  }

  @Test
  void emailDoAlvoDigitadoIncorretamenteRetorna422InvalidConfirmation() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-confirm@teste.com");
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Justificativa válida",
            "mode",
            "GRACE",
            "days",
            10,
            "confirmEmail",
            "outro-email-digitado@teste.com",
            "password",
            TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("INVALID_CONFIRMATION"));
  }

  @Test
  void senhaIncorretaNaReautenticacaoRetorna403ReauthFailed() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-reauth@teste.com");
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Justificativa válida",
            "mode",
            "GRACE",
            "days",
            10,
            "confirmEmail",
            alvo.email(),
            "password",
            "senha-errada-999");

    mockMvc
        .perform(
            post("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("REAUTH_FAILED"));
  }

  @Test
  void autoexclusaoPeloPainelAdminEhRecusadaCom409SelfActionForbidden() throws Exception {
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Tentando me autoexcluir pelo painel",
            "mode",
            "GRACE",
            "days",
            10,
            "confirmEmail",
            admin.email(),
            "password",
            TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + admin.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SELF_ACTION_FORBIDDEN"));
  }

  @Test
  void exclusaoDoAdministradorRaizEhRecusadaCom403RootProtected() throws Exception {
    var rootSeed = seed.createRoot("root-alvo@teste.com");
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Tentando excluir o raiz",
            "mode",
            "GRACE",
            "days",
            10,
            "confirmEmail",
            rootSeed.email(),
            "password",
            TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + rootSeed.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));
  }

  @Test
  void exclusaoDoUltimoAdministradorAtivoEhRecusadaCom409LastAdmin() throws Exception {
    var executorSeed = seed.createAdmin("adm-executor@teste.com");
    String execToken =
        testUsers.login("adm-executor@teste.com", TestUsers.PASSWORD).get("accessToken").asText();
    TestUser executor = new TestUser(executorSeed.id(), executorSeed.email(), execToken);

    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Excluindo o último admin",
            "mode",
            "GRACE",
            "days",
            10,
            "confirmEmail",
            adminRow.email(),
            "password",
            TestUsers.PASSWORD);

    ExecutorService pool = Executors.newFixedThreadPool(1);
    try (Connection holder = dataSource.getConnection()) {
      holder.setAutoCommit(false);
      try (Statement s = holder.createStatement()) {
        s.execute("SELECT pg_advisory_xact_lock(hashtext('gefinc.admin-set'))");
      }

      Future<ResultActions> future =
          pool.submit(
              () ->
                  mockMvc.perform(
                      post("/admin/users/" + adminRow.id() + "/deletion")
                          .header(HttpHeaders.AUTHORIZATION, executor.bearer())
                          .contentType(MediaType.APPLICATION_JSON)
                          .content(json(body))));

      await()
          .atMost(Duration.ofSeconds(10))
          .until(
              () ->
                  jdbc.queryForObject(
                          "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND NOT granted",
                          Long.class)
                      == 1L);

      // Enquanto a transação espera a trava, suspendemos o executor
      jdbc.update("UPDATE users SET suspended_at = now() WHERE id = ?", executorSeed.id());

      // Libera a trava
      holder.commit();

      future
          .get(10, TimeUnit.SECONDS)
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("LAST_ADMIN"));
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void exclusaoSempreProssegueComSmtpForaEErroViraComunicacaoPendente() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-smtp@teste.com");

    GREEN_MAIL.stop(); // SMTP desligado!
    try {
      var body =
          Map.of(
              "reasonId",
              reasonId,
              "justification",
              "Exclusão que prossegue mesmo sem SMTP",
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
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("SCHEDULED"))
          .andExpect(jsonPath("$.noticeState").value("PENDING"));

      // A exclusão foi registrada normalmente
      assertThat(
              jdbc.queryForObject(
                  "SELECT status FROM account_deletion_requests WHERE user_id = ?",
                  String.class,
                  alvo.id()))
          .isEqualTo("SCHEDULED");

      // Gerou comunicação pendente
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM pending_communications WHERE user_id = ? AND state = 'PENDING'",
                  Long.class,
                  alvo.id()))
          .isEqualTo(1);
    } finally {
      GREEN_MAIL.start();
    }
  }
}
