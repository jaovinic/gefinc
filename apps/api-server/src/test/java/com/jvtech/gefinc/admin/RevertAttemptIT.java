package com.jvtech.gefinc.admin;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.auth.TokenService;
import com.jvtech.gefinc.support.AdminClient;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Quem está suspenso, ou teve a exclusão pedida por um administrador, não reverte a decisão por
 * nenhum canal (login, renovação, cancelamento da exclusão, redefinição de senha, sessão antiga):
 * todos são recusados e a tentativa vira {@code REVERT_ATTEMPT}, uma só linha por janela de 15
 * minutos (mesmo IP e mesma decisão), com o IP em {@code audit_log_client}; as repetições só
 * incrementam um contador.
 */
class RevertAttemptIT extends IntegrationTestBase {

  private static final String IP = "198.51.100.40";
  private static final String OTHER_IP = "203.0.113.77";
  private static final String SUPPRESSED = "gefinc.admin.attempts.suppressed";

  private AdminClient api;
  private TestUsers users;
  private SeededUser admin;
  private SeededUser victim;

  @BeforeEach
  void init() {
    api = new AdminClient(mockMvc, objectMapper);
    users = new TestUsers(mockMvc, objectMapper);
    admin = seed.createAdmin("adm@teste.com");
    victim = seed.createUser("alvo@teste.com");
  }

  private ResultActions postFrom(String path, String ip, Object body) throws Exception {
    return mockMvc.perform(
        post(path)
            .with(
                request -> {
                  request.setRemoteAddr(ip);
                  return request;
                })
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(body)));
  }

  private ResultActions login(String ip) throws Exception {
    return postFrom(
        "/auth/login", ip, Map.of("email", "alvo@teste.com", "password", TestUsers.PASSWORD));
  }

  private ResultActions refresh(String ip, String refreshToken) throws Exception {
    return postFrom("/auth/refresh", ip, Map.of("refreshToken", refreshToken));
  }

  private ResultActions cancelDeletion(String ip) throws Exception {
    return postFrom(
        "/auth/account-deletion/cancel",
        ip,
        Map.of("email", "alvo@teste.com", "password", TestUsers.PASSWORD));
  }

  private void confirmReset(String newPassword) throws Exception {
    String raw = TokenService.newRawToken();
    Instant now = clock.instant();
    jdbc.update(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)"
            + " VALUES (?, ?, ?, ?)",
        victim.id(),
        TokenService.hash(raw),
        Timestamp.from(now.plus(Duration.ofMinutes(30))),
        Timestamp.from(now));
    postFrom("/auth/password-reset/confirm", IP, Map.of("token", raw, "newPassword", newPassword))
        .andExpect(status().isNoContent());
  }

  private List<Map<String, Object>> attempts() {
    return jdbc.queryForList("SELECT * FROM audit_log WHERE action = 'REVERT_ATTEMPT' ORDER BY id");
  }

  private long clientRows() {
    return jdbc.queryForObject("SELECT count(*) FROM audit_log_client", Long.class);
  }

  // ------------------------------------------------------------------ suspensão

  @Test
  void suspensoNaoRevertePorNenhumCanalEGeraUmUnicoRegistroPorJanela() throws Exception {
    JsonNode session = users.login("alvo@teste.com", TestUsers.PASSWORD);
    double suppressedBefore = counter(SUPPRESSED, "type", "REVERT_ATTEMPT");
    // suspensão direto no banco: os tokens anteriores seguem válidos até serem recusados
    seed.suspend(victim.id(), clock.instant());

    // sessão antiga (token de acesso): recusada
    api.me(session.get("accessToken").asText()).andExpect(status().isUnauthorized());
    // renovação com o token de renovação ainda válido: recusada, tokens revogados, nada reativa
    refresh(IP, session.get("refreshToken").asText())
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"))
        .andExpect(matchesContract());
    // o token de renovação já foi revogado: a repetição responde 401 e só incrementa o contador
    refresh(IP, session.get("refreshToken").asText()).andExpect(status().isUnauthorized());
    // login com credenciais corretas
    login(IP)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"));
    // cancelar exclusão com credenciais corretas
    cancelDeletion(IP)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"));
    // redefinição de senha: a senha muda, mas o login continua recusado
    confirmReset("nova-senha-segura-456");
    postFrom(
            "/auth/login",
            IP,
            Map.of("email", "alvo@teste.com", "password", "nova-senha-segura-456"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"));

    assertThat(
            jdbc.queryForObject(
                "SELECT suspended_at IS NOT NULL FROM users WHERE id = ?",
                Boolean.class,
                victim.id()))
        .isTrue();
    List<Map<String, Object>> rows = attempts();
    assertThat(rows).hasSize(1);
    assertThat(rows.get(0))
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "ACCOUNT_SUSPENDED")
        .containsEntry("actor_kind", "USER")
        .containsEntry("actor_user_id", victim.id())
        .containsEntry("target_user_id", victim.id());
    assertThat(String.valueOf(rows.get(0).get("details"))).isEqualTo("{}");
    assertThat(clientRows()).isEqualTo(1);
    Map<String, Object> client = jdbc.queryForMap("SELECT * FROM audit_log_client");
    assertThat(client).containsEntry("ip", IP).containsEntry("user_id", victim.id());
    // 4 tentativas além da primeira: renovação repetida, login, cancelamento e o login após a troca
    assertThat(counter(SUPPRESSED, "type", "REVERT_ATTEMPT") - suppressedBefore).isEqualTo(4.0);
  }

  @Test
  void novaJanelaOuOutroIpGeramNovoRegistro() throws Exception {
    seed.suspend(victim.id(), clock.instant());

    login(IP).andExpect(status().isForbidden());
    login(IP).andExpect(status().isForbidden());
    assertThat(attempts()).hasSize(1);

    login(OTHER_IP).andExpect(status().isForbidden());
    assertThat(attempts()).hasSize(2);

    clock.advance(Duration.ofMinutes(16));
    login(IP).andExpect(status().isForbidden());
    assertThat(attempts()).hasSize(3);
    assertThat(clientRows()).isEqualTo(3);
  }

  @Test
  void senhaErradaNaoGeraTentativaDeReverter() throws Exception {
    seed.suspend(victim.id(), clock.instant());

    postFrom("/auth/login", IP, Map.of("email", "alvo@teste.com", "password", "senha-errada-999"))
        .andExpect(status().isUnauthorized());

    assertThat(attempts()).isEmpty();
  }

  @Test
  void contaSuspensaComExclusaoDoProprioUsuarioNaoCancelaAExclusao() throws Exception {
    seed.scheduleDeletion(victim.id(), clock.instant());
    seed.suspend(victim.id(), clock.instant());

    cancelDeletion(IP)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"));

    assertThat(
            jdbc.queryForObject(
                "SELECT deletion_requested_at IS NOT NULL FROM users WHERE id = ?",
                Boolean.class,
                victim.id()))
        .isTrue();
    assertThat(attempts()).hasSize(1);
  }

  // ------------------------------------------------------------------ exclusão pedida pelo
  // administrador

  @Test
  void exclusaoDoAdministradorNaoRevertePorNenhumCanalEGeraUmUnicoRegistro() throws Exception {
    JsonNode session = users.login("alvo@teste.com", TestUsers.PASSWORD);
    seed.scheduleAdminDeletion(victim.id(), admin.id(), clock.instant());

    // sessão antiga: recusada
    api.me(session.get("accessToken").asText()).andExpect(status().isUnauthorized());
    // renovação: recusada (401) e a tentativa fica registrada
    refresh(IP, session.get("refreshToken").asText()).andExpect(status().isUnauthorized());
    // login com credenciais corretas só informa a exclusão pendente
    login(IP)
        .andExpect(status().isLocked())
        .andExpect(jsonPath("$.code").value("ACCOUNT_DELETION_PENDING"));
    // cancelar: decisão administrativa não se reverte
    cancelDeletion(IP)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ADMIN_DECISION_LOCKED"))
        .andExpect(matchesContract());
    // redefinição de senha: a senha muda, a exclusão segue
    confirmReset("nova-senha-segura-456");
    postFrom(
            "/auth/login",
            IP,
            Map.of("email", "alvo@teste.com", "password", "nova-senha-segura-456"))
        .andExpect(status().isLocked());

    assertThat(
            jdbc.queryForObject(
                "SELECT deletion_origin FROM users WHERE id = ?", String.class, victim.id()))
        .isEqualTo("ADMIN");
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM account_deletion_requests WHERE user_id = ?",
                String.class,
                victim.id()))
        .isEqualTo("SCHEDULED");
    List<Map<String, Object>> rows = attempts();
    assertThat(rows).hasSize(1);
    assertThat(rows.get(0))
        .containsEntry("refusal_code", "ADMIN_DECISION_LOCKED")
        .containsEntry("actor_kind", "USER")
        .containsEntry("actor_user_id", victim.id())
        .containsEntry("target_user_id", victim.id());
    assertThat(jdbc.queryForMap("SELECT * FROM audit_log_client")).containsEntry("ip", IP);
    assertThat(clientRows()).isEqualTo(1);
  }

  @Test
  void exclusaoPedidaPeloProprioUsuarioContinuaCancelavelSemRegistroDeTentativa() throws Exception {
    seed.scheduleDeletion(victim.id(), clock.instant());

    cancelDeletion(IP).andExpect(status().isNoContent());

    assertThat(
            jdbc.queryForObject(
                "SELECT deletion_requested_at IS NULL FROM users WHERE id = ?",
                Boolean.class,
                victim.id()))
        .isTrue();
    assertThat(attempts()).isEmpty();
  }

  @Test
  void suspensaoTemPrecedenciaSobreAExclusaoAdministrativaNoRegistro() throws Exception {
    // suspensa e com exclusão do administrador: a suspensão é checada primeiro
    seed.suspend(victim.id(), clock.instant());
    seed.scheduleAdminDeletion(victim.id(), admin.id(), clock.instant());

    login(IP).andExpect(status().isForbidden());
    cancelDeletion(IP).andExpect(status().isForbidden());

    // as duas tentativas foram recusadas pela mesma decisão (a suspensão): uma só linha
    assertThat(attempts()).hasSize(1);
    assertThat(attempts().get(0)).containsEntry("refusal_code", "ACCOUNT_SUSPENDED");
  }
}
