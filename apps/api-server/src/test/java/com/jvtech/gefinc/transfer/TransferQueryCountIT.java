package com.jvtech.gefinc.transfer;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** A listagem não faz consulta por transferência: o número de comandos SQL não cresce com elas. */
class TransferQueryCountIT extends IntegrationTestBase {

  @Autowired private EntityManagerFactory entityManagerFactory;

  private TestApi api;
  private TestUser ana;
  private long itau;
  private long wallet;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    itau = api.checking(ana, "Itaú");
    wallet = api.cash(ana, "Carteira");
  }

  private long statementsOfList() throws Exception {
    Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    statistics.setStatisticsEnabled(true);
    try {
      statistics.clear();
      JsonNode page = api.get(ana, "/transfers?month=2026-11&size=200");
      assertThat(page.get("content").size()).isPositive();
      return statistics.getPrepareStatementCount();
    } finally {
      statistics.setStatisticsEnabled(false);
    }
  }

  @Test
  void listaComMuitasTransferenciasUsaOMesmoNumeroDeConsultas() throws Exception {
    for (int i = 0; i < 3; i++) {
      api.transfer(ana, itau, wallet, "1.00", "2026-11-10");
    }
    long few = statementsOfList();

    for (int i = 0; i < 47; i++) {
      api.transfer(
          ana, i % 2 == 0 ? wallet : itau, i % 2 == 0 ? itau : wallet, "1.00", "2026-11-11");
    }
    long many = statementsOfList();

    assertThat(many).isEqualTo(few);
    assertThat(api.get(ana, "/transfers?month=2026-11&size=200").get("totalElements").asInt())
        .isEqualTo(50);
  }
}
