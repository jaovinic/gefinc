package com.jvtech.gefinc.admin.user;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static com.jvtech.gefinc.support.ContractAssertions.responseMatchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.auth.TokenService;
import com.jvtech.gefinc.common.security.JwtService;
import com.jvtech.gefinc.support.AdminClient;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestTokens;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Sessões de autenticação no painel (US3): a lista mostra início, último uso, IP e dispositivo;
 * encerrar uma ou todas vale na requisição seguinte (claim {@code sid} e {@code
 * auth_sessions.revoked_at}) e a família de renovação cai junto; sem aviso ao usuário; sessões
 * anteriores à feature (sem {@code sid}) valem até expirar e a primeira renovação cria a linha;
 * logout, troca de senha, redefinição e exclusão também marcam as linhas.
 */
class SessionManagementIT extends IntegrationTestBase {

  private static final String CHROME_WINDOWS =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
          + " Chrome/120.0.0.0 Safari/537.36";
  private static final String FIREFOX_LINUX =
      "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";

  @Autowired private JwtService jwt;

  private AdminClient api;
  private TestUsers users;
  private TestUser admin;
  private SeededUser adminRow;
  private SeededUser target;

  @BeforeEach
  void init() throws Exception {
    api = new AdminClient(mockMvc, objectMapper);
    users = new TestUsers(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm@teste.com");
    admin = api.login(adminRow.id(), "adm@teste.com");
    target = seed.createUser("alvo@teste.com");
  }

  private JsonNode targetLogin() throws Exception {
    return users.login("alvo@teste.com", TestUsers.PASSWORD);
  }

  private JsonNode list(long id) throws Exception {
    return api.json(
        api.sessions(admin, id).andExpect(status().isOk()).andExpect(matchesContract()));
  }

  private int httpStatus(String accessToken) throws Exception {
    return api.me(accessToken).andReturn().getResponse().getStatus();
  }

  private Map<String, Object> sessionRow(String sessionId) {
    return jdbc.queryForMap("SELECT * FROM auth_sessions WHERE id = ?::uuid", sessionId);
  }

  private long auditCount(String action) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_log WHERE action = ?", Long.class, action);
  }

  // ------------------------------------------------------------------ lista

  @Test
  void listaInicioUltimoUsoIpDispositivoEOrdemDecrescente() throws Exception {
    Instant first = clock.instant();
    JsonNode a =
        users.loginFrom("alvo@teste.com", TestUsers.PASSWORD, "203.0.113.7", CHROME_WINDOWS);
    clock.advance(Duration.ofMinutes(10));
    Instant second = clock.instant();
    JsonNode b =
        users.loginFrom("alvo@teste.com", TestUsers.PASSWORD, "198.51.100.9", FIREFOX_LINUX);

    JsonNode sessions = list(target.id());

    assertThat(sessions).hasSize(2);
    JsonNode newest = sessions.get(0);
    JsonNode oldest = sessions.get(1);
    assertThat(newest.get("id").asText())
        .isEqualTo(TestTokens.sessionId(b.get("accessToken").asText()).toString());
    assertThat(Instant.parse(newest.get("startedAt").asText())).isEqualTo(second);
    assertThat(Instant.parse(newest.get("lastUsedAt").asText())).isEqualTo(second);
    assertThat(newest.get("ip").asText()).isEqualTo("198.51.100.9");
    assertThat(newest.get("device").asText()).isEqualTo("Firefox em Linux");
    assertThat(newest.get("current").asBoolean()).isFalse();
    assertThat(oldest.get("id").asText())
        .isEqualTo(TestTokens.sessionId(a.get("accessToken").asText()).toString());
    assertThat(Instant.parse(oldest.get("startedAt").asText())).isEqualTo(first);
    assertThat(oldest.get("ip").asText()).isEqualTo("203.0.113.7");
    assertThat(oldest.get("device").asText()).isEqualTo("Chrome em Windows");
    // nunca o User-Agent bruto
    assertThat(sessions.toString()).doesNotContain("Mozilla").doesNotContain("AppleWebKit");
  }

  @Test
  void currentMarcaASessaoDoSolicitante() throws Exception {
    JsonNode other = users.login("adm@teste.com", TestUsers.PASSWORD);

    JsonNode sessions = list(adminRow.id());

    assertThat(sessions).hasSize(2);
    String mine = TestTokens.sessionId(admin.accessToken()).toString();
    String theOther = TestTokens.sessionId(other.get("accessToken").asText()).toString();
    for (JsonNode session : sessions) {
      assertThat(session.get("current").asBoolean())
          .isEqualTo(session.get("id").asText().equals(mine));
    }
    assertThat(sessions.findValuesAsText("id")).containsExactlyInAnyOrder(mine, theOther);
  }

  @Test
  void sessaoEncerradaEExpiradaNaoAparecemNaLista() throws Exception {
    JsonNode revoked = targetLogin();
    String revokedId = TestTokens.sessionId(revoked.get("accessToken").asText()).toString();
    api.revokeSession(admin, target.id(), revokedId).andExpect(status().isNoContent());
    JsonNode expiring = targetLogin();

    assertThat(list(target.id())).hasSize(1);

    clock.advance(Duration.ofDays(31));
    admin = api.login(adminRow.id(), "adm@teste.com");
    assertThat(expiring).isNotNull();
    assertThat(list(target.id())).isEmpty();
  }

  @Test
  void ipEDispositivoSaoOmitidosEmSessaoSemEsseDado() throws Exception {
    JsonNode login = targetLogin();
    String sid = TestTokens.sessionId(login.get("accessToken").asText()).toString();
    jdbc.update(
        "UPDATE auth_sessions SET client_ip = NULL, device_label = NULL WHERE id = ?::uuid", sid);

    JsonNode session = list(target.id()).get(0);

    assertThat(session.has("ip")).isFalse();
    assertThat(session.has("device")).isFalse();
  }

  @Test
  void usuarioInexistenteDa404() throws Exception {
    api.sessions(admin, 999_999L)
        .andExpect(status().isNotFound())
        .andExpect(responseMatchesContract());
  }

  // ------------------------------------------------------------------ último uso

  @Test
  void ultimoUsoSoMudaNaRenovacaoEASessaoSegueOMesmoSid() throws Exception {
    JsonNode login = targetLogin();
    UUID sid = TestTokens.sessionId(login.get("accessToken").asText());
    Instant started = clock.instant();

    clock.advance(Duration.ofMinutes(5));
    TestUser asTarget =
        new TestUser(target.id(), "alvo@teste.com", login.get("accessToken").asText());
    api.me(asTarget.accessToken()).andExpect(status().isOk());
    api.me(asTarget.accessToken()).andExpect(status().isOk());
    assertThat(
            jdbc.queryForObject(
                    "SELECT last_used_at FROM auth_sessions WHERE id = ?", Timestamp.class, sid)
                .toInstant())
        .isEqualTo(started);

    clock.advance(Duration.ofMinutes(5));
    Instant renewedAt = clock.instant();
    JsonNode renewed =
        api.json(
            mockMvc
                .perform(
                    post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                            objectMapper.writeValueAsString(
                                Map.of("refreshToken", login.get("refreshToken").asText()))))
                .andExpect(status().isOk()));

    assertThat(TestTokens.sessionId(renewed.get("accessToken").asText())).isEqualTo(sid);
    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM auth_sessions WHERE id = ?", sid);
    assertThat(((Timestamp) row.get("last_used_at")).toInstant()).isEqualTo(renewedAt);
    assertThat(((Timestamp) row.get("created_at")).toInstant()).isEqualTo(started);
    assertThat(((Timestamp) row.get("expires_at")).toInstant())
        .isEqualTo(renewedAt.plus(Duration.ofDays(30)));
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM auth_sessions WHERE user_id = ?", Long.class, target.id()))
        .isEqualTo(1);
  }

  // ------------------------------------------------------------------ encerrar uma

  @Test
  void encerrarUmaSessaoValeNaRequisicaoSeguinteEDerrubaAFamiliaDeRenovacao() throws Exception {
    JsonNode first = targetLogin();
    JsonNode second = targetLogin();
    String firstSid = TestTokens.sessionId(first.get("accessToken").asText()).toString();
    assertThat(httpStatus(first.get("accessToken").asText())).isEqualTo(200);

    api.revokeSession(admin, target.id(), firstSid)
        .andExpect(status().isNoContent())
        .andExpect(matchesContract());

    assertThat(httpStatus(first.get("accessToken").asText())).isEqualTo(401);
    assertThat(httpStatus(second.get("accessToken").asText())).isEqualTo(200);
    Map<String, Object> row = sessionRow(firstSid);
    assertThat(row.get("revoked_at")).isNotNull();
    assertThat(row).containsEntry("revoked_by", "ADMIN");
    mockMvc
        .perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("refreshToken", first.get("refreshToken").asText()))))
        .andExpect(status().isUnauthorized());
    // a outra sessão segue renovável
    mockMvc
        .perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("refreshToken", second.get("refreshToken").asText()))))
        .andExpect(status().isOk());
    assertThat(list(target.id())).hasSize(1);
    Map<String, Object> audit =
        jdbc.queryForMap("SELECT * FROM audit_log WHERE action = 'SESSION_REVOKED'");
    assertThat(audit)
        .containsEntry("result", "SUCCESS")
        .containsEntry("actor_user_id", adminRow.id())
        .containsEntry("target_user_id", target.id())
        .containsEntry("subject", firstSid);
  }

  @Test
  void encerrarSessaoDeOutroUsuarioOuIdInvalidoDa404() throws Exception {
    SeededUser stranger = seed.createUser("outro@teste.com");
    JsonNode strangerLogin = users.login("outro@teste.com", TestUsers.PASSWORD);
    String strangerSid = TestTokens.sessionId(strangerLogin.get("accessToken").asText()).toString();

    api.revokeSession(admin, target.id(), strangerSid)
        .andExpect(status().isNotFound())
        .andExpect(responseMatchesContract());
    api.revokeSession(admin, target.id(), UUID.randomUUID().toString())
        .andExpect(status().isNotFound());
    api.revokeSession(admin, target.id(), "isto-nao-e-um-uuid").andExpect(status().isNotFound());

    assertThat(httpStatus(strangerLogin.get("accessToken").asText())).isEqualTo(200);
    assertThat(sessionRow(strangerSid).get("revoked_at")).isNull();
    assertThat(stranger.id()).isPositive();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'SESSION_REVOKED'"
                    + " AND result = 'REFUSED' AND refusal_code = 'NOT_FOUND'",
                Long.class))
        .isEqualTo(3);
  }

  @Test
  void encerrarSessaoJaEncerradaEIdempotente() throws Exception {
    JsonNode login = targetLogin();
    String sid = TestTokens.sessionId(login.get("accessToken").asText()).toString();

    api.revokeSession(admin, target.id(), sid).andExpect(status().isNoContent());
    Object revokedAt = sessionRow(sid).get("revoked_at");
    clock.advance(Duration.ofMinutes(1));
    api.revokeSession(admin, target.id(), sid).andExpect(status().isNoContent());

    assertThat(sessionRow(sid).get("revoked_at")).isEqualTo(revokedAt);
  }

  // ------------------------------------------------------------------ encerrar todas

  @Test
  void encerrarTodasValeNaRequisicaoSeguinteEContaNaAuditoria() throws Exception {
    JsonNode first = targetLogin();
    JsonNode second = targetLogin();
    int versionBefore =
        jdbc.queryForObject(
            "SELECT token_version FROM users WHERE id = ?", Integer.class, target.id());

    api.revokeAllSessions(admin, target.id())
        .andExpect(status().isNoContent())
        .andExpect(matchesContract());

    assertThat(httpStatus(first.get("accessToken").asText())).isEqualTo(401);
    assertThat(httpStatus(second.get("accessToken").asText())).isEqualTo(401);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL",
                Long.class,
                target.id()))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(DISTINCT revoked_by) FROM auth_sessions WHERE user_id = ?"
                    + " AND revoked_by = 'ADMIN'",
                Long.class,
                target.id()))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL",
                Long.class,
                target.id()))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT token_version FROM users WHERE id = ?", Integer.class, target.id()))
        .isGreaterThan(versionBefore);
    Map<String, Object> audit =
        jdbc.queryForMap("SELECT * FROM audit_log WHERE action = 'SESSIONS_REVOKED_ALL'");
    assertThat(audit)
        .containsEntry("result", "SUCCESS")
        .containsEntry("target_user_id", target.id());
    assertThat(String.valueOf(audit.get("details"))).contains("\"count\"").contains("2");
    // o usuário volta a entrar normalmente: nada foi suspenso
    users.login("alvo@teste.com", TestUsers.PASSWORD);
  }

  @Test
  void naoHaAvisoAoUsuarioQuandoAsSessoesSaoEncerradas() throws Exception {
    JsonNode login = targetLogin();
    String sid = TestTokens.sessionId(login.get("accessToken").asText()).toString();

    api.revokeSession(admin, target.id(), sid).andExpect(status().isNoContent());
    api.revokeAllSessions(admin, target.id()).andExpect(status().isNoContent());
    awaitPendingMails();

    assertThat(GREEN_MAIL.getReceivedMessages()).isEmpty();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM user_notices", Long.class)).isZero();
  }

  // ------------------------------------------------------------------ sessões anteriores à feature

  private record Legacy(String accessToken, String refreshToken, UUID family) {}

  /** Família de renovação sem linha em {@code auth_sessions} e token de acesso sem {@code sid}. */
  private Legacy legacySession(long userId) {
    UUID family = UUID.randomUUID();
    String raw = TokenService.newRawToken();
    Instant now = clock.instant();
    jdbc.update(
        "INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, created_at)"
            + " VALUES (?, ?, ?, ?, ?)",
        userId,
        family,
        TokenService.hash(raw),
        Timestamp.from(now.plus(Duration.ofDays(30))),
        Timestamp.from(now));
    int version =
        jdbc.queryForObject("SELECT token_version FROM users WHERE id = ?", Integer.class, userId);
    return new Legacy(jwt.issueAccessToken(userId, version), raw, family);
  }

  @Test
  void tokenSemSidValeAteExpirarEAPrimeiraRenovacaoCriaALinha() throws Exception {
    Legacy legacy = legacySession(target.id());
    assertThat(httpStatus(legacy.accessToken())).isEqualTo(200);
    assertThat(list(target.id())).isEmpty();

    clock.advance(Duration.ofMinutes(3));
    Instant renewedAt = clock.instant();
    JsonNode renewed =
        api.json(
            mockMvc
                .perform(
                    post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                            objectMapper.writeValueAsString(
                                Map.of("refreshToken", legacy.refreshToken()))))
                .andExpect(status().isOk()));

    UUID sid = TestTokens.sessionId(renewed.get("accessToken").asText());
    assertThat(sid).isEqualTo(legacy.family());
    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM auth_sessions WHERE id = ?", sid);
    assertThat(row).containsEntry("user_id", target.id());
    assertThat(row.get("revoked_at")).isNull();
    assertThat(((Timestamp) row.get("last_used_at")).toInstant()).isEqualTo(renewedAt);
    assertThat(list(target.id())).hasSize(1);
    assertThat(httpStatus(renewed.get("accessToken").asText())).isEqualTo(200);
  }

  @Test
  void encerrarTodasToleraESessaoSemLinhaEDerrubaOTokenLegado() throws Exception {
    Legacy legacy = legacySession(target.id());
    JsonNode tracked = targetLogin();

    api.revokeAllSessions(admin, target.id()).andExpect(status().isNoContent());

    assertThat(httpStatus(legacy.accessToken())).isEqualTo(401);
    assertThat(httpStatus(tracked.get("accessToken").asText())).isEqualTo(401);
    mockMvc
        .perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(Map.of("refreshToken", legacy.refreshToken()))))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void tokenComSidMasSemLinhaNaoVale() throws Exception {
    JsonNode login = targetLogin();
    jdbc.update("DELETE FROM auth_sessions WHERE user_id = ?", target.id());

    assertThat(httpStatus(login.get("accessToken").asText())).isEqualTo(401);
  }

  // ------------------------------------------------------------------ recusas de regra

  @Test
  void encerrarSessoesDoRaizEhRecusadoComRootProtected() throws Exception {
    SeededUser root = seed.createRoot("raiz@teste.com");
    JsonNode rootLogin = users.login("raiz@teste.com", TestUsers.PASSWORD);
    String rootSid = TestTokens.sessionId(rootLogin.get("accessToken").asText()).toString();

    api.revokeAllSessions(admin, root.id())
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"))
        .andExpect(responseMatchesContract());
    api.revokeSession(admin, root.id(), rootSid)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"));

    assertThat(httpStatus(rootLogin.get("accessToken").asText())).isEqualTo(200);
    // a leitura continua permitida
    assertThat(list(root.id())).hasSize(1);
    assertThat(auditCount("SESSION_REVOKED")).isEqualTo(1);
    assertThat(auditCount("SESSIONS_REVOKED_ALL")).isEqualTo(1);
  }

  @Test
  void aSessaoAtualEATodasDoProprioAdministradorSaoRecusadasMasAsOutrasNao() throws Exception {
    JsonNode other = users.login("adm@teste.com", TestUsers.PASSWORD);
    String currentSid = TestTokens.sessionId(admin.accessToken()).toString();
    String otherSid = TestTokens.sessionId(other.get("accessToken").asText()).toString();

    api.revokeSession(admin, adminRow.id(), currentSid)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SELF_ACTION_FORBIDDEN"))
        .andExpect(responseMatchesContract());
    api.revokeAllSessions(admin, adminRow.id())
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SELF_ACTION_FORBIDDEN"));
    assertThat(httpStatus(admin.accessToken())).isEqualTo(200);
    assertThat(httpStatus(other.get("accessToken").asText())).isEqualTo(200);

    api.revokeSession(admin, adminRow.id(), otherSid).andExpect(status().isNoContent());

    assertThat(httpStatus(other.get("accessToken").asText())).isEqualTo(401);
    assertThat(httpStatus(admin.accessToken())).isEqualTo(200);
  }

  // ------------------------------------------------------------------ outros caminhos marcam as
  // linhas

  @Test
  void logoutMarcaASessaoComoEncerradaPeloUsuario() throws Exception {
    JsonNode login = targetLogin();
    String sid = TestTokens.sessionId(login.get("accessToken").asText()).toString();

    mockMvc
        .perform(
            post("/auth/logout")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + login.get("accessToken").asText())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("refreshToken", login.get("refreshToken").asText()))))
        .andExpect(status().isNoContent());

    Map<String, Object> row = sessionRow(sid);
    assertThat(row.get("revoked_at")).isNotNull();
    assertThat(row).containsEntry("revoked_by", "USER");
    assertThat(list(target.id())).isEmpty();
  }

  @Test
  void trocaDeSenhaMarcaAsAnterioresEAbreUmaNova() throws Exception {
    JsonNode first = targetLogin();
    JsonNode second = targetLogin();
    String firstSid = TestTokens.sessionId(first.get("accessToken").asText()).toString();
    String secondSid = TestTokens.sessionId(second.get("accessToken").asText()).toString();

    JsonNode changed =
        api.json(
            mockMvc
                .perform(
                    post("/auth/password")
                        .header(
                            HttpHeaders.AUTHORIZATION,
                            "Bearer " + first.get("accessToken").asText())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                            objectMapper.writeValueAsString(
                                Map.of(
                                    "currentPassword",
                                    TestUsers.PASSWORD,
                                    "newPassword",
                                    "nova-senha-segura-456"))))
                .andExpect(status().isOk()));

    assertThat(sessionRow(firstSid)).containsEntry("revoked_by", "USER");
    assertThat(sessionRow(secondSid)).containsEntry("revoked_by", "USER");
    String newSid = TestTokens.sessionId(changed.get("accessToken").asText()).toString();
    assertThat(newSid).isNotIn(firstSid, secondSid);
    assertThat(sessionRow(newSid).get("revoked_at")).isNull();
    assertThat(httpStatus(changed.get("accessToken").asText())).isEqualTo(200);
  }

  @Test
  void redefinicaoDeSenhaMarcaAsSessoes() throws Exception {
    JsonNode login = targetLogin();
    String sid = TestTokens.sessionId(login.get("accessToken").asText()).toString();
    String raw = TokenService.newRawToken();
    Instant now = clock.instant();
    jdbc.update(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)"
            + " VALUES (?, ?, ?, ?)",
        target.id(),
        TokenService.hash(raw),
        Timestamp.from(now.plus(Duration.ofMinutes(30))),
        Timestamp.from(now));

    mockMvc
        .perform(
            post("/auth/password-reset/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("token", raw, "newPassword", "nova-senha-segura-456"))))
        .andExpect(status().isNoContent());

    assertThat(sessionRow(sid)).containsEntry("revoked_by", "USER");
    assertThat(sessionRow(sid).get("revoked_at")).isNotNull();
  }

  @Test
  void pedidoDeExclusaoDaContaMarcaAsSessoes() throws Exception {
    JsonNode login = targetLogin();
    String sid = TestTokens.sessionId(login.get("accessToken").asText()).toString();

    mockMvc
        .perform(
            post("/auth/account-deletion")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + login.get("accessToken").asText())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("password", TestUsers.PASSWORD))))
        .andExpect(status().isAccepted());

    assertThat(sessionRow(sid)).containsEntry("revoked_by", "USER");
    assertThat(sessionRow(sid).get("revoked_at")).isNotNull();
  }

  @Test
  void todasAsSessoesAbertasDoUsuarioAparecemEmOpenSessionsDoDetalhe() throws Exception {
    List<JsonNode> logins = new ArrayList<>();
    for (int i = 0; i < 3; i++) {
      logins.add(targetLogin());
    }

    JsonNode detail = api.json(api.detail(admin, target.id()).andExpect(status().isOk()));

    assertThat(detail.get("openSessions").asInt()).isEqualTo(logins.size());
  }
}
