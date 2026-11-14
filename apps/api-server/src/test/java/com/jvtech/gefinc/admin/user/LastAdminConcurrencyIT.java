package com.jvtech.gefinc.admin.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.sql.Connection;
import java.sql.Statement;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * Dois administradores (sem raiz), cada um retirando o perfil do outro ao mesmo tempo: no máximo
 * uma retirada vale (trava consultiva {@code gefinc.admin-set}), sem deadlock, e a outra recebe
 * {@code LAST_ADMIN} (R14). O teste segura a própria trava até as duas requisições estarem
 * esperando por ela, o que torna a corrida determinística: as duas passam pelo filtro ainda como
 * administradores.
 */
class LastAdminConcurrencyIT extends IntegrationTestBase {

  @Autowired private DataSource dataSource;

  private TestUser login(SeededUser user, String email) throws Exception {
    String token =
        new TestUsers(mockMvc, objectMapper)
            .login(email, TestUsers.PASSWORD)
            .get("accessToken")
            .asText();
    return new TestUser(user.id(), email, token);
  }

  @Test
  void duasRetiradasCruzadasDeixamUmAdministradorEAOutraRecebeLastAdmin() throws Exception {
    SeededUser a = seed.createAdmin("a@example.com");
    SeededUser b = seed.createAdmin("b@example.com");
    TestUser tokenA = login(a, "a@example.com");
    TestUser tokenB = login(b, "b@example.com");
    TestApi api = new TestApi(mockMvc, objectMapper);
    Map<String, String> body = Map.of("role", "USER", "password", TestUsers.PASSWORD);
    CyclicBarrier start = new CyclicBarrier(2);

    ExecutorService pool = Executors.newFixedThreadPool(2);
    try (Connection holder = dataSource.getConnection()) {
      holder.setAutoCommit(false);
      try (Statement s = holder.createStatement()) {
        s.execute("SELECT pg_advisory_xact_lock(hashtext('gefinc.admin-set'))");
      }

      Callable<Integer> aRevokesB =
          () -> {
            start.await(10, TimeUnit.SECONDS);
            return api.call(tokenA, HttpMethod.PUT, "/admin/users/" + b.id() + "/role", body)
                .andReturn()
                .getResponse()
                .getStatus();
          };
      Callable<Integer> bRevokesA =
          () -> {
            start.await(10, TimeUnit.SECONDS);
            return api.call(tokenB, HttpMethod.PUT, "/admin/users/" + a.id() + "/role", body)
                .andReturn()
                .getResponse()
                .getStatus();
          };
      Future<Integer> first = pool.submit(aRevokesB);
      Future<Integer> second = pool.submit(bRevokesA);

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
                "SELECT count(*) FROM users WHERE role IN ('ADMIN', 'ROOT')", Long.class))
        .isEqualTo(1L);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'ROLE_REVOKED'"
                    + " AND result = 'SUCCESS'",
                Long.class))
        .isEqualTo(1L);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'ROLE_REVOKED'"
                    + " AND result = 'REFUSED' AND refusal_code = 'LAST_ADMIN'",
                Long.class))
        .isEqualTo(1L);
  }
}
