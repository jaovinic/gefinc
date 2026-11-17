package com.jvtech.gefinc.admin.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.jvtech.gefinc.common.security.AuthenticatedUser;
import com.jvtech.gefinc.common.security.JwtService;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestTokens;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Ordem global das travas na revogação da sessão atual (quinta falha de reautenticação): {@code
 * users} (só no ramo sem {@code sid}), depois {@code refresh_tokens} e, por fim, {@code
 * auth_sessions}. A renovação ({@code TokenService.rotate}), o logout e a ação administrativa sobre
 * sessões travam o token ANTES de escrever na sessão; se o revogador escrevesse na sessão antes do
 * token, os dois lados se esperariam e o PostgreSQL derrubaria um deles com {@code 40P01}.
 *
 * <p>A prova é determinística, sem {@code sleep}: uma conexão separada faz o papel de quem já
 * travou o token (renovação, logout ou ação do administrador), o revogador fica esperando em {@code
 * pg_stat_activity} e, enquanto espera, a linha da sessão tem de continuar livre ({@code FOR UPDATE
 * NOWAIT} sucede). Depois a conexão escreve na sessão (o passo seguinte da renovação) sem deadlock.
 *
 * <p>Limite: o deadlock em si não é reproduzido (dependeria do {@code deadlock_timeout} e do acaso
 * do agendamento); o que se prova é a ordem das escritas, que o impede por construção.
 */
class SidSessionRevokerLockOrderIT extends IntegrationTestBase {

  private static final String EMAIL = "adm@example.com";

  @Autowired private DataSource dataSource;
  @Autowired private CurrentSessionRevoker revoker;
  @Autowired private JwtService jwt;
  @Autowired private PlatformTransactionManager transactionManager;

  private SeededUser admin;
  private UUID sessionId;

  private void init() throws Exception {
    admin = seed.createAdmin(EMAIL);
    String token =
        new TestUsers(mockMvc, objectMapper)
            .login(EMAIL, TestUsers.PASSWORD)
            .get("accessToken")
            .asText();
    sessionId = TestTokens.sessionId(token);
  }

  /** Faz o papel da renovação/logout: trava o token da família (como o {@code findByTokenHash}). */
  private void lockToken(Connection holder) throws SQLException {
    try (PreparedStatement statement =
        holder.prepareStatement("SELECT id FROM refresh_tokens WHERE family_id = ? FOR UPDATE")) {
      statement.setObject(1, sessionId);
      statement.executeQuery().close();
    }
  }

  /** O passo seguinte da renovação: marca o uso da sessão. */
  private void touchSession(Connection holder) throws SQLException {
    try (PreparedStatement statement =
        holder.prepareStatement("UPDATE auth_sessions SET last_used_at = now() WHERE id = ?")) {
      statement.setObject(1, sessionId);
      statement.executeUpdate();
    }
  }

  /**
   * Espera até que alguma consulta que COMEÇA por {@code queryPrefix} esteja bloqueada numa trava e
   * devolve o pid dela (uma espera de outra origem não conta).
   */
  private int awaitBlockedOnLock(String queryPrefix) {
    return await()
        .atMost(Duration.ofSeconds(15))
        .pollInterval(Duration.ofMillis(20))
        .until(
            () ->
                jdbc.queryForList(
                    "SELECT pid FROM pg_stat_activity WHERE datname = current_database()"
                        + " AND wait_event_type = 'Lock' AND query LIKE ?",
                    Integer.class,
                    queryPrefix + "%"),
            pids -> !pids.isEmpty())
        .get(0);
  }

  private void assertSessionFree() {
    try {
      jdbc.queryForList("SELECT 1 FROM auth_sessions WHERE id = ? FOR UPDATE NOWAIT", sessionId);
    } catch (DataAccessException e) {
      throw new AssertionError(
          "O revogador travou auth_sessions antes de esperar o token (ordem de travas)", e);
    }
  }

  private void revokeCurrentAs(AuthenticatedUser principal) {
    SecurityContextHolder.getContext()
        .setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, null));
    try {
      revoker.revokeCurrent(principal.id());
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  /** Revoga enquanto "outra requisição" segura o token; devolve ao terminar de revogar. */
  private void race(AuthenticatedUser principal) throws Exception {
    ExecutorService pool = Executors.newSingleThreadExecutor();
    try (Connection holder = dataSource.getConnection()) {
      holder.setAutoCommit(false);
      try {
        lockToken(holder);
        Future<?> revocation = pool.submit(() -> revokeCurrentAs(principal));
        awaitBlockedOnLock("UPDATE refresh_tokens");
        try {
          assertSessionFree();
          touchSession(holder);
        } finally {
          holder.commit();
        }
        revocation.get(30, TimeUnit.SECONDS);
      } finally {
        holder.rollback();
      }
    } finally {
      pool.shutdownNow();
    }
  }

  private boolean sessionRevoked() {
    return jdbc.queryForObject(
        "SELECT revoked_at IS NOT NULL FROM auth_sessions WHERE id = ?", Boolean.class, sessionId);
  }

  private long openTokens() {
    return jdbc.queryForObject(
        "SELECT count(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL",
        Long.class,
        admin.id());
  }

  @Test
  void ramoComSidEsperaOTokenAntesDeEscreverNaSessao() throws Exception {
    init();

    race(new AuthenticatedUser(admin.id(), "ADMIN", sessionId));

    assertThat(sessionRevoked()).isTrue();
    assertThat(openTokens()).isZero();
    // a versão do token não é mexida quando a sessão tem sid
    assertThat(tokenVersion()).isZero();
  }

  @Test
  void ramoSemSidEsperaOTokenAntesDeEscreverNaSessao() throws Exception {
    init();

    race(new AuthenticatedUser(admin.id(), "ADMIN", null));

    assertThat(sessionRevoked()).isTrue();
    assertThat(openTokens()).isZero();
    assertThat(tokenVersion()).isEqualTo(1);
  }

  private int tokenVersion() {
    return jdbc.queryForObject(
        "SELECT token_version FROM users WHERE id = ?", Integer.class, admin.id());
  }

  /**
   * Cinco trocas de perfil (alvo: o próprio administrador) com a senha errada, pela rota real: a
   * reautenticação roda ANTES de travar a linha do alvo, então o {@code UPDATE users} da transação
   * própria do revogador não encontra a linha segura pela transação externa. Em uma thread com
   * prazo: um auto-bloqueio (duas conexões do mesmo fluxo, que o PostgreSQL não detecta) viraria
   * timeout aqui.
   */
  private void fiveWrongPasswordsOnOwnRole(TestUser actor) throws Exception {
    TestApi api = new TestApi(mockMvc, objectMapper);
    ExecutorService pool = Executors.newSingleThreadExecutor();
    try {
      Future<?> attempts =
          pool.submit(
              () -> {
                for (int i = 0; i < 5; i++) {
                  try {
                    api.call(
                            actor,
                            HttpMethod.PUT,
                            "/admin/users/" + actor.id() + "/role",
                            Map.of("role", "USER", "password", "senha-errada-999"))
                        .andExpect(
                            org.springframework.test.web.servlet.result.MockMvcResultMatchers
                                .status()
                                .isForbidden());
                  } catch (Exception e) {
                    throw new IllegalStateException(e);
                  }
                }
              });
      attempts.get(30, TimeUnit.SECONDS);
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void quintaFalhaPelaRotaRealComSidNaoSeAutoBloqueia() throws Exception {
    init();
    String token =
        new TestUsers(mockMvc, objectMapper)
            .login(EMAIL, TestUsers.PASSWORD)
            .get("accessToken")
            .asText();
    UUID currentSid = TestTokens.sessionId(token);

    fiveWrongPasswordsOnOwnRole(new TestUser(admin.id(), EMAIL, token));

    assertThat(
            jdbc.queryForObject(
                "SELECT revoked_at IS NOT NULL FROM auth_sessions WHERE id = ?",
                Boolean.class,
                currentSid))
        .isTrue();
    assertThat(jdbc.queryForObject("SELECT role FROM users WHERE id = ?", String.class, admin.id()))
        .isEqualTo("ADMIN");
  }

  @Test
  void quintaFalhaPelaRotaRealSemSidNaoSeAutoBloqueia() throws Exception {
    init();
    String legacy = jwt.issueAccessToken(admin.id(), 0);

    fiveWrongPasswordsOnOwnRole(new TestUser(admin.id(), EMAIL, legacy));

    assertThat(tokenVersion()).isEqualTo(1);
    assertThat(openTokens()).isZero();
    assertThat(sessionRevoked()).isTrue();
  }

  /**
   * Caracteriza o perigo apontado na revisão: se uma transação externa JÁ segurasse a linha do
   * administrador, o {@code UPDATE users} do ramo sem {@code sid} (transação própria, outra
   * conexão) esperaria uma trava que só some quando a externa termina, e o PostgreSQL não vê esse
   * ciclo (a espera da externa é só em Java). Hoje nenhum fluxo faz isso: {@code
   * Reauthenticator.verify} roda antes de qualquer trava do usuário. O teste cancela a espera pelo
   * servidor para não depender de prazo.
   */
  @Test
  void ramoSemSidComALinhaDoAdminJaTravadaPelaExternaFicariaEsperandoAoInfinito() throws Exception {
    init();
    ExecutorService pool = Executors.newSingleThreadExecutor();
    try {
      Future<?> outer =
          pool.submit(
              () ->
                  new TransactionTemplate(transactionManager)
                      .executeWithoutResult(
                          status -> {
                            jdbc.queryForList(
                                "SELECT id FROM users WHERE id = ? FOR UPDATE", admin.id());
                            revokeCurrentAs(new AuthenticatedUser(admin.id(), "ADMIN", null));
                          }));
      int blockedPid = awaitBlockedOnLock("UPDATE users SET token_version");
      try {
        assertThat(
                jdbc.queryForObject(
                    "SELECT query FROM pg_stat_activity WHERE pid = ?", String.class, blockedPid))
            .startsWith("UPDATE users SET token_version");
      } finally {
        jdbc.queryForObject("SELECT pg_cancel_backend(?)", Boolean.class, blockedPid);
      }

      org.assertj.core.api.Assertions.assertThatThrownBy(() -> outer.get(30, TimeUnit.SECONDS))
          .isInstanceOf(ExecutionException.class);
      assertThat(tokenVersion()).isZero();
    } finally {
      pool.shutdownNow();
    }
  }
}
