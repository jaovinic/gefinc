package com.jvtech.gefinc.admin.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.AdminClient;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import java.sql.Connection;
import java.sql.Statement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Corridas da suspensão: dois administradores suspendendo um ao outro deixam um ativo (trava
 * consultiva, sem deadlock); uma gravação concorrente de outra coluna da conta não desfaz a
 * suspensão nem a versão do token ({@code @DynamicUpdate}); logins e renovações em paralelo com a
 * suspensão não a reativam nem deixam token de acesso válido.
 */
class SuspensionConcurrencyIT extends IntegrationTestBase {

  @Autowired private DataSource dataSource;
  @Autowired private UserRepository users;
  @Autowired private PlatformTransactionManager transactionManager;

  @Test
  void duasSuspensoesCruzadasDeixamUmAdministradorEAOutraRecebeLastAdmin() throws Exception {
    SeededUser a = seed.createAdmin("a@teste.com");
    SeededUser b = seed.createAdmin("b@teste.com");
    AdminClient api = new AdminClient(mockMvc, objectMapper);
    TestUser tokenA = api.login(a.id(), "a@teste.com");
    TestUser tokenB = api.login(b.id(), "b@teste.com");
    CyclicBarrier start = new CyclicBarrier(2);

    ExecutorService pool = Executors.newFixedThreadPool(2);
    try (Connection holder = dataSource.getConnection()) {
      holder.setAutoCommit(false);
      try (Statement s = holder.createStatement()) {
        s.execute("SELECT pg_advisory_xact_lock(hashtext('gefinc.admin-set'))");
      }
      Callable<Integer> aSuspendsB =
          () -> {
            start.await(10, TimeUnit.SECONDS);
            return api.suspend(tokenA, b.id(), "Motivo A").andReturn().getResponse().getStatus();
          };
      Callable<Integer> bSuspendsA =
          () -> {
            start.await(10, TimeUnit.SECONDS);
            return api.suspend(tokenB, a.id(), "Motivo B").andReturn().getResponse().getStatus();
          };
      Future<Integer> first = pool.submit(aSuspendsB);
      Future<Integer> second = pool.submit(bSuspendsA);

      await()
          .atMost(Duration.ofSeconds(15))
          .until(
              () ->
                  jdbc.queryForObject(
                          "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND NOT granted",
                          Long.class)
                      == 2L);
      holder.commit();

      List<Integer> statuses =
          List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
      assertThat(statuses).containsExactlyInAnyOrder(204, 409);
    } finally {
      pool.shutdownNow();
    }

    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE suspended_at IS NULL AND role = 'ADMIN'",
                Long.class))
        .isEqualTo(1L);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'USER_SUSPENDED'"
                    + " AND result = 'SUCCESS'",
                Long.class))
        .isEqualTo(1L);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'USER_SUSPENDED'"
                    + " AND result = 'REFUSED' AND refusal_code = 'LAST_ADMIN'",
                Long.class))
        .isEqualTo(1L);
  }

  @Test
  void gravacaoConcorrenteDeOutraColunaNaoDesfazASuspensaoNemAVersaoDoToken() throws Exception {
    SeededUser admin = seed.createAdmin("adm@teste.com");
    SeededUser target = seed.createUser("alvo@teste.com");
    AdminClient api = new AdminClient(mockMvc, objectMapper);
    TestUser adminToken = api.login(admin.id(), "adm@teste.com");
    int versionBefore =
        jdbc.queryForObject(
            "SELECT token_version FROM users WHERE id = ?", Integer.class, target.id());
    ExecutorService pool = Executors.newSingleThreadExecutor();
    try {
      new TransactionTemplate(transactionManager)
          .executeWithoutResult(
              status -> {
                // A conta é carregada (cópia em memória sem suspensão) ...
                User stale = users.findById(target.id()).orElseThrow();
                try {
                  // ... a suspensão confirma em outra transação (outra thread) ...
                  int code =
                      pool.submit(
                              () ->
                                  api.suspend(adminToken, target.id(), "Motivo")
                                      .andReturn()
                                      .getResponse()
                                      .getStatus())
                          .get(20, TimeUnit.SECONDS);
                  assertThat(code).isEqualTo(204);
                } catch (Exception e) {
                  throw new IllegalStateException(e);
                }
                // ... e a gravação tardia de outra coluna só pode levar essa coluna.
                stale.rename("Nome novo");
              });
    } finally {
      pool.shutdownNow();
    }

    Map<String, Object> row =
        jdbc.queryForMap(
            "SELECT name, suspended_at IS NOT NULL AS suspended, token_version FROM users"
                + " WHERE id = ?",
            target.id());
    assertThat(row).containsEntry("name", "Nome novo").containsEntry("suspended", true);
    assertThat((Integer) row.get("token_version")).isGreaterThan(versionBefore);
  }

  @Test
  void loginsERenovacoesEmParaleloComASuspensaoNaoReativamNemDeixamTokenValido() throws Exception {
    SeededUser admin = seed.createAdmin("adm@teste.com");
    SeededUser target = seed.createUser("alvo@teste.com");
    AdminClient api = new AdminClient(mockMvc, objectMapper);
    TestUser adminToken = api.login(admin.id(), "adm@teste.com");
    JsonNode first =
        new TestUsers(mockMvc, objectMapper).login("alvo@teste.com", TestUsers.PASSWORD);
    ConcurrentLinkedQueue<String> accessTokens = new ConcurrentLinkedQueue<>();
    accessTokens.add(first.get("accessToken").asText());
    CountDownLatch go = new CountDownLatch(1);
    int workers = 4;
    ExecutorService pool = Executors.newFixedThreadPool(workers + 1);
    List<Future<?>> futures = new ArrayList<>();
    try {
      for (int w = 0; w < workers; w++) {
        boolean refresher = w % 2 == 0;
        futures.add(
            pool.submit(
                () -> {
                  go.await();
                  for (int i = 0; i < 12; i++) {
                    var result =
                        refresher
                            ? mockMvc
                                .perform(
                                    post("/auth/refresh")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                            objectMapper.writeValueAsString(
                                                Map.of(
                                                    "refreshToken",
                                                    first.get("refreshToken").asText()))))
                                .andReturn()
                            : api.login("alvo@teste.com", TestUsers.PASSWORD).andReturn();
                    if (result.getResponse().getStatus() == 200) {
                      accessTokens.add(
                          objectMapper
                              .readTree(result.getResponse().getContentAsString())
                              .get("accessToken")
                              .asText());
                    }
                  }
                  return null;
                }));
      }
      Future<Integer> suspension =
          pool.submit(
              () -> {
                go.await();
                Thread.sleep(30);
                return api.suspend(adminToken, target.id(), "Motivo")
                    .andReturn()
                    .getResponse()
                    .getStatus();
              });
      go.countDown();
      for (Future<?> future : futures) {
        future.get(60, TimeUnit.SECONDS);
      }
      assertThat(suspension.get(60, TimeUnit.SECONDS)).isEqualTo(204);
    } finally {
      pool.shutdownNow();
    }

    assertThat(
            jdbc.queryForObject(
                "SELECT suspended_at IS NOT NULL FROM users WHERE id = ?",
                Boolean.class,
                target.id()))
        .isTrue();
    for (String token : accessTokens) {
      api.me(token).andExpect(status().isUnauthorized());
    }
    api.login("alvo@teste.com", TestUsers.PASSWORD).andExpect(status().isForbidden());
  }
}
