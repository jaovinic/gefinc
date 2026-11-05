package com.jvtech.gefinc.transfer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/** Transferências simultâneas: sem deadlock, sem saldo corrompido e sem linha órfã. */
class TransferConcurrencyIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
  }

  private int transfer(long from, long to, String amount) throws Exception {
    return mockMvc
        .perform(
            post("/transfers")
                .header(HttpHeaders.AUTHORIZATION, ana.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        api.transferBody(from, to, amount, "2026-11-10"))))
        .andReturn()
        .getResponse()
        .getStatus();
  }

  private int deleteAccount(long id) throws Exception {
    return mockMvc
        .perform(delete("/accounts/" + id).header(HttpHeaders.AUTHORIZATION, ana.bearer()))
        .andReturn()
        .getResponse()
        .getStatus();
  }

  private static List<Integer> run(List<Callable<Integer>> tasks) throws Exception {
    ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
    try {
      CountDownLatch ready = new CountDownLatch(tasks.size());
      CountDownLatch go = new CountDownLatch(1);
      List<Future<Integer>> futures = new ArrayList<>();
      for (Callable<Integer> task : tasks) {
        futures.add(
            pool.submit(
                () -> {
                  ready.countDown();
                  go.await();
                  return task.call();
                }));
      }
      ready.await();
      go.countDown();
      List<Integer> statuses = new ArrayList<>();
      for (Future<Integer> future : futures) {
        statuses.add(future.get(60, TimeUnit.SECONDS));
      }
      return statuses;
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void transferenciasEmSentidosOpostosNaoEntramEmDeadlockESaldoFinalEExato() throws Exception {
    long a = api.checking(ana, "Itaú");
    long b = api.cash(ana, "Carteira");
    List<Callable<Integer>> tasks = new ArrayList<>();
    for (int i = 0; i < 10; i++) {
      tasks.add(() -> transfer(a, b, "10.00"));
      tasks.add(() -> transfer(b, a, "3.00"));
    }

    List<Integer> statuses = run(tasks);

    assertThat(statuses).hasSize(20).containsOnly(201);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM account_transfers", Integer.class))
        .isEqualTo(20);
    assertThat(api.balanceOf(ana, a)).isEqualTo("-70.00");
    assertThat(api.balanceOf(ana, b)).isEqualTo("70.00");
    assertThat(api.get(ana, "/balances").get("total").asText()).isEqualTo("0.00");
  }

  @Test
  void transferenciaContraExclusaoDaContaNuncaDeixaLinhaOrfa() throws Exception {
    long partner = api.checking(ana, "Parceira");
    int created = 0;
    int deleted = 0;
    for (int round = 0; round < 10; round++) {
      long victim = api.cash(ana, "Descartável " + round);

      List<Integer> statuses =
          run(
              List.<Callable<Integer>>of(
                  () -> transfer(victim, partner, "5.00"), () -> deleteAccount(victim)));

      int transferStatus = statuses.get(0);
      int deleteStatus = statuses.get(1);
      Integer rows =
          jdbc.queryForObject(
              "SELECT count(*) FROM account_transfers WHERE from_account_id = ?",
              Integer.class,
              victim);
      Integer accounts =
          jdbc.queryForObject("SELECT count(*) FROM accounts WHERE id = ?", Integer.class, victim);
      if (transferStatus == 201) {
        // A transferência venceu: a conta passou a ter uso e a exclusão foi recusada.
        assertThat(deleteStatus).isEqualTo(409);
        assertThat(rows).isEqualTo(1);
        assertThat(accounts).isEqualTo(1);
        created++;
      } else {
        // A exclusão venceu: a transferência não encontrou a conta.
        assertThat(transferStatus).isEqualTo(404);
        assertThat(deleteStatus).isEqualTo(204);
        assertThat(rows).isZero();
        assertThat(accounts).isZero();
        deleted++;
      }
    }
    assertThat(created + deleted).isEqualTo(10);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM account_transfers t WHERE NOT EXISTS"
                    + " (SELECT 1 FROM accounts a WHERE a.id = t.from_account_id)",
                Integer.class))
        .isZero();
  }
}
