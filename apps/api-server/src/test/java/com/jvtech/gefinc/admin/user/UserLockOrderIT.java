package com.jvtech.gefinc.admin.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.auth.TokenService;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Ordem global das travas: {@code users} primeiro, depois a trava consultiva, {@code
 * refresh_tokens}, {@code auth_sessions} e, por fim, {@code password_reset_tokens} e {@code
 * account_deletion_requests}. A ação do administrador trava o usuário antes de tocar nos tokens; as
 * rotas da própria pessoa que escrevem em tokens têm de esperar o usuário ANTES de travar um token,
 * senão os dois lados se esperam e o PostgreSQL derruba um deles com {@code 40P01}.
 *
 * <p>A prova é determinística, sem {@code sleep}: uma conexão separada faz o papel do administrador
 * (trava a linha do usuário), a requisição fica esperando em {@code pg_stat_activity}, e enquanto
 * espera a linha do token tem de continuar livre ({@code FOR UPDATE NOWAIT} sucede).
 */
class UserLockOrderIT extends IntegrationTestBase {

  @Autowired private DataSource dataSource;

  private SeededUser user;
  private TestUser session;
  private JsonNode login;

  private void init() throws Exception {
    user = seed.createUser("alvo@teste.com");
    login = new TestUsers(mockMvc, objectMapper).login("alvo@teste.com", TestUsers.PASSWORD);
    session = new TestUser(user.id(), "alvo@teste.com", login.get("accessToken").asText());
  }

  /** Faz o papel da ação administrativa: trava o usuário e, depois, mexe nos tokens. */
  private void adminSuspends(Connection admin) throws SQLException {
    execute(admin, "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = ?");
    execute(
        admin,
        "UPDATE auth_sessions SET revoked_at = now(), revoked_by = 'ADMIN' WHERE user_id = ?");
    execute(
        admin,
        "UPDATE users SET suspended_at = now(), token_version = token_version + 1 WHERE id = ?");
  }

  private void execute(Connection admin, String sql) throws SQLException {
    try (PreparedStatement statement = admin.prepareStatement(sql)) {
      statement.setLong(1, user.id());
      statement.executeUpdate();
    }
  }

  private void lockUser(Connection admin) throws SQLException {
    try (PreparedStatement statement =
        admin.prepareStatement("SELECT id FROM users WHERE id = ? FOR UPDATE")) {
      statement.setLong(1, user.id());
      statement.executeQuery().close();
    }
  }

  private void awaitBlockedOnLock() {
    await()
        .atMost(Duration.ofSeconds(15))
        .pollInterval(Duration.ofMillis(20))
        .until(
            () ->
                jdbc.queryForObject(
                        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()"
                            + " AND wait_event_type = 'Lock'",
                        Long.class)
                    > 0);
  }

  private void assertFree(String table, String column, Object value) {
    try {
      jdbc.queryForList(
          "SELECT 1 FROM " + table + " WHERE " + column + " = ? FOR UPDATE NOWAIT", value);
    } catch (DataAccessException e) {
      throw new AssertionError(
          "A requisição travou " + table + " antes de esperar o usuário (ordem de travas)", e);
    }
  }

  /** Executa a requisição enquanto a conexão "administrador" segura o usuário; devolve o status. */
  private int race(Callable<Integer> request, Runnable whileWaiting) throws Exception {
    return race(request, whileWaiting, this::adminSuspends);
  }

  @FunctionalInterface
  private interface AdminAction {
    void run(Connection admin) throws SQLException;
  }

  private int race(Callable<Integer> request, Runnable whileWaiting, AdminAction action)
      throws Exception {
    ExecutorService pool = Executors.newSingleThreadExecutor();
    try (Connection admin = dataSource.getConnection()) {
      admin.setAutoCommit(false);
      try {
        lockUser(admin);
        Future<Integer> response = pool.submit(request);
        awaitBlockedOnLock();
        try {
          whileWaiting.run();
        } finally {
          action.run(admin);
          admin.commit();
        }
        return response.get(30, TimeUnit.SECONDS);
      } finally {
        admin.rollback();
      }
    } finally {
      pool.shutdownNow();
    }
  }

  private boolean suspended() {
    return jdbc.queryForObject(
        "SELECT suspended_at IS NOT NULL FROM users WHERE id = ?", Boolean.class, user.id());
  }

  private long openTokens() {
    return jdbc.queryForObject(
        "SELECT count(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL",
        Long.class,
        user.id());
  }

  @Test
  void renovacaoEsperaOUsuarioAntesDeTravarOTokenENuncaDa40P01() throws Exception {
    init();
    String refreshToken = login.get("refreshToken").asText();

    int status =
        race(
            () ->
                mockMvc
                    .perform(
                        post("/auth/refresh")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                objectMapper.writeValueAsString(
                                    Map.of("refreshToken", refreshToken))))
                    .andReturn()
                    .getResponse()
                    .getStatus(),
            () -> assertFree("refresh_tokens", "token_hash", TokenService.hash(refreshToken)));

    assertThat(status).isIn(401, 403);
    assertThat(suspended()).isTrue();
    assertThat(openTokens()).isZero();
  }

  @Test
  void trocaDeSenhaEsperaOUsuarioAntesDeEscreverERecusaContaSuspensa() throws Exception {
    init();

    int status =
        race(
            () ->
                mockMvc
                    .perform(
                        post("/auth/password")
                            .header(HttpHeaders.AUTHORIZATION, session.bearer())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                objectMapper.writeValueAsString(
                                    Map.of(
                                        "currentPassword",
                                        TestUsers.PASSWORD,
                                        "newPassword",
                                        "outra-senha-forte-456"))))
                    .andReturn()
                    .getResponse()
                    .getStatus(),
            () ->
                assertFree(
                    "refresh_tokens",
                    "token_hash",
                    TokenService.hash(login.get("refreshToken").asText())));

    assertThat(status).isIn(401, 403);
    assertThat(suspended()).isTrue();
    // nenhuma sessão nova para a conta suspensa
    assertThat(openTokens()).isZero();
  }

  @Test
  void confirmacaoDeRedefinicaoEsperaOUsuarioAntesDeEscreverNoToken() throws Exception {
    init();
    String rawReset = TokenService.newRawToken();
    String resetHash = TokenService.hash(rawReset);
    jdbc.update(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)"
            + " VALUES (?, ?, ?, ?)",
        user.id(),
        resetHash,
        java.sql.Timestamp.from(clock.instant().plus(Duration.ofHours(1))),
        java.sql.Timestamp.from(clock.instant()));

    int status =
        race(
            () ->
                mockMvc
                    .perform(
                        post("/auth/password-reset/confirm")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                objectMapper.writeValueAsString(
                                    Map.of(
                                        "token",
                                        rawReset,
                                        "newPassword",
                                        "outra-senha-forte-456"))))
                    .andReturn()
                    .getResponse()
                    .getStatus(),
            () -> assertFree("password_reset_tokens", "token_hash", resetHash));

    // A redefinição de senha é legítima mesmo com a conta suspensa e não a reativa.
    assertThat(status).isEqualTo(204);
    assertThat(suspended()).isTrue();
    assertThat(openTokens()).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT used_at IS NOT NULL FROM password_reset_tokens WHERE token_hash = ?",
                Boolean.class,
                resetHash))
        .isTrue();
  }

  @Test
  void cancelamentoDaExclusaoEsperaOUsuarioAntesDeTravarOLivroRazao() throws Exception {
    init();
    seed.scheduleDeletion(user.id(), clock.instant());

    int status =
        race(
            () ->
                mockMvc
                    .perform(
                        post("/auth/account-deletion/cancel")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                objectMapper.writeValueAsString(
                                    Map.of(
                                        "email",
                                        "alvo@teste.com",
                                        "password",
                                        TestUsers.PASSWORD))))
                    .andReturn()
                    .getResponse()
                    .getStatus(),
            () -> assertFree("account_deletion_requests", "user_id", user.id()));

    // conta suspensa enquanto esperava: o cancelamento é recusado e a exclusão segue agendada
    assertThat(status).isEqualTo(403);
    assertThat(suspended()).isTrue();
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM account_deletion_requests WHERE user_id = ?",
                String.class,
                user.id()))
        .isEqualTo("SCHEDULED");
  }

  private Callable<Integer> cancelRequest(String password) {
    return () ->
        mockMvc
            .perform(
                post("/auth/account-deletion/cancel")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        objectMapper.writeValueAsString(
                            Map.of("email", "alvo@teste.com", "password", password))))
            .andReturn()
            .getResponse()
            .getStatus();
  }

  private String deletionStatus() {
    return jdbc.queryForObject(
        "SELECT status FROM account_deletion_requests WHERE user_id = ?", String.class, user.id());
  }

  /**
   * A senha é conferida (BCrypt, caro) SEM a trava do usuário: numa rota sem autenticação, quem
   * erra a senha em massa não pode ficar segurando a linha. Com o usuário travado por outra
   * conexão, a senha errada é recusada sem esperar.
   */
  @Test
  void cancelamentoComSenhaErradaNaoEsperaATravaDoUsuario() throws Exception {
    init();
    seed.scheduleDeletion(user.id(), clock.instant());
    ExecutorService pool = Executors.newSingleThreadExecutor();
    try (Connection admin = dataSource.getConnection()) {
      admin.setAutoCommit(false);
      try {
        lockUser(admin);
        Future<Integer> response = pool.submit(cancelRequest("senha-errada-999"));

        assertThat(response.get(10, TimeUnit.SECONDS)).isEqualTo(401);
      } finally {
        admin.rollback();
      }
    } finally {
      pool.shutdownNow();
    }
    assertThat(deletionStatus()).isEqualTo("SCHEDULED");
  }

  /**
   * A senha conferida antes da trava vale só para o hash lido: se mudou enquanto esperava, recusa.
   */
  @Test
  void cancelamentoReconfereASenhaDepoisDaTravaQuandoOHashMudou() throws Exception {
    init();
    seed.scheduleDeletion(user.id(), clock.instant());

    int status =
        race(
            cancelRequest(TestUsers.PASSWORD),
            () -> assertFree("account_deletion_requests", "user_id", user.id()),
            admin -> {
              try (PreparedStatement statement =
                  admin.prepareStatement("UPDATE users SET password_hash = ? WHERE id = ?")) {
                statement.setString(1, "hash-trocado-durante-a-espera");
                statement.setLong(2, user.id());
                statement.executeUpdate();
              }
            });

    assertThat(status).isEqualTo(401);
    assertThat(deletionStatus()).isEqualTo("SCHEDULED");
  }
}
