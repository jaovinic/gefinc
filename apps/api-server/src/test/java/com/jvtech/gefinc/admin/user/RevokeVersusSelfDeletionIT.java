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
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * O administrador B retira o perfil do administrador A enquanto A pede a própria exclusão. As duas
 * transações tomam a linha de A e a trava consultiva {@code gefinc.admin-set} na mesma ordem
 * (linha, depois trava), então não há deadlock (40P01 viraria 500). Desfecho aceito, qualquer que
 * seja quem chega primeiro: A fica como usuário comum com a exclusão agendada, a retirada responde
 * 204 e a exclusão 202. Se a exclusão agenda antes, a retirada enxerga A como conta em exclusão
 * (inativa) e não precisa de outro administrador; se a retirada vem antes, a exclusão lê o papel já
 * atualizado e segue como usuário comum.
 *
 * <p>O teste segura a trava consultiva até a segunda requisição estar bloqueada (na trava ou na
 * linha de A), sem espera fixa: a corrida é determinística.
 */
class RevokeVersusSelfDeletionIT extends IntegrationTestBase {

  @Autowired private DataSource dataSource;

  private TestUser login(SeededUser user, String email) throws Exception {
    String token =
        new TestUsers(mockMvc, objectMapper)
            .login(email, TestUsers.PASSWORD)
            .get("accessToken")
            .asText();
    return new TestUser(user.id(), email, token);
  }

  private void awaitBlocked(long expected) {
    await()
        .atMost(Duration.ofSeconds(15))
        .until(
            () ->
                jdbc.queryForObject("SELECT count(*) FROM pg_locks WHERE NOT granted", Long.class)
                    == expected);
  }

  private void run(boolean deletionFirst) throws Exception {
    SeededUser a = seed.createAdmin("a@example.com");
    SeededUser b = seed.createAdmin("b@example.com");
    TestUser tokenA = login(a, "a@example.com");
    TestUser tokenB = login(b, "b@example.com");
    TestApi api = new TestApi(mockMvc, objectMapper);
    Map<String, String> revoke = Map.of("role", "USER", "password", TestUsers.PASSWORD);
    Map<String, String> deletion = Map.of("password", TestUsers.PASSWORD);

    Callable<Integer> bRevokesA =
        () ->
            api.call(tokenB, HttpMethod.PUT, "/admin/users/" + a.id() + "/role", revoke)
                .andReturn()
                .getResponse()
                .getStatus();
    Callable<Integer> aDeletes =
        () ->
            api.call(tokenA, HttpMethod.POST, "/auth/account-deletion", deletion)
                .andReturn()
                .getResponse()
                .getStatus();

    ExecutorService pool = Executors.newFixedThreadPool(2);
    try (Connection holder = dataSource.getConnection()) {
      holder.setAutoCommit(false);
      try (Statement s = holder.createStatement()) {
        s.execute("SELECT pg_advisory_xact_lock(hashtext('gefinc.admin-set'))");
      }

      Future<Integer> first = pool.submit(deletionFirst ? aDeletes : bRevokesA);
      awaitBlocked(1);
      Future<Integer> second = pool.submit(deletionFirst ? bRevokesA : aDeletes);
      awaitBlocked(2);
      holder.commit();

      Integer deletionStatus = (deletionFirst ? first : second).get(20, TimeUnit.SECONDS);
      Integer revokeStatus = (deletionFirst ? second : first).get(20, TimeUnit.SECONDS);
      assertThat(deletionStatus).as("exclusão da própria conta").isEqualTo(202);
      assertThat(revokeStatus).as("retirada do perfil").isEqualTo(204);
    } finally {
      pool.shutdownNow();
    }

    Map<String, Object> row =
        jdbc.queryForMap(
            "SELECT role, deletion_requested_at IS NOT NULL AS pending FROM users WHERE id = ?",
            a.id());
    assertThat(row).containsEntry("role", "USER").containsEntry("pending", true);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'ROLE_REVOKED'"
                    + " AND result = 'SUCCESS'",
                Long.class))
        .isEqualTo(1L);
  }

  @Test
  void exclusaoAgendaPrimeiroERetiradaVeOAlvoEmExclusao() throws Exception {
    run(true);
  }

  @Test
  void retiradaVemPrimeiroEExclusaoSegueComoUsuarioComum() throws Exception {
    run(false);
  }
}
