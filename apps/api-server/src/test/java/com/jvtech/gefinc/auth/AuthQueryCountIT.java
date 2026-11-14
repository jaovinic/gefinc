package com.jvtech.gefinc.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.admin.common.AdminTestEndpoints;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;

/**
 * Validar o token custa uma só consulta: a projeção de {@code users} com a junção em {@code
 * auth_sessions} pela chave primária, sem escrita por requisição (R4). Papel, exclusão pendente e
 * versão do token vêm dela.
 */
@Import(AdminTestEndpoints.class)
@TestPropertySource(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
class AuthQueryCountIT extends IntegrationTestBase {

  @Autowired private EntityManagerFactory entityManagerFactory;

  @Test
  void requisicaoAutenticadaExecutaExatamenteUmaConsultaPreparada() throws Exception {
    seed.createAdmin("adm@example.com");
    String token =
        new TestUsers(mockMvc, objectMapper)
            .login("adm@example.com", TestUsers.PASSWORD)
            .get("accessToken")
            .asText();
    Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    assertThat(statistics.isStatisticsEnabled()).isTrue();

    statistics.clear();
    mockMvc
        .perform(get("/admin/_test/read").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
        .andExpect(status().isOk());

    assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
    assertThat(statistics.getEntityUpdateCount()).isZero();
    assertThat(statistics.getEntityInsertCount()).isZero();
  }
}
