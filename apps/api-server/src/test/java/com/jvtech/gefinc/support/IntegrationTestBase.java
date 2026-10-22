package com.jvtech.gefinc.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;
import com.jvtech.gefinc.auth.LoginAttemptLimiter;
import com.jvtech.gefinc.auth.PasswordResetRateLimiter;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Base dos testes de integração: PostgreSQL 16 real (Testcontainers) com as migrações Flyway reais,
 * e-mail capturado pelo GreenMail e relógio controlável (Princípio IV).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestClockConfig.class)
public abstract class IntegrationTestBase {

  private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

  static {
    POSTGRES.start();
  }

  @RegisterExtension
  protected static final GreenMailExtension GREEN_MAIL =
      new GreenMailExtension(ServerSetupTest.SMTP);

  @DynamicPropertySource
  static void databaseProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired protected MockMvc mockMvc;
  @Autowired protected ObjectMapper objectMapper;
  @Autowired protected JdbcTemplate jdbc;
  @Autowired protected MutableClock clock;
  @Autowired private PasswordResetRateLimiter passwordResetRateLimiter;
  @Autowired private LoginAttemptLimiter loginAttemptLimiter;

  @BeforeEach
  void resetState() throws Exception {
    clock.set(TestClockConfig.START);
    passwordResetRateLimiter.clear();
    loginAttemptLimiter.clear();
    List<String> tables =
        jdbc.queryForList(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
                + " AND tablename <> 'flyway_schema_history'",
            String.class);
    if (!tables.isEmpty()) {
      jdbc.execute(
          "TRUNCATE TABLE "
              + String.join(", ", tables.stream().map(t -> "\"" + t + "\"").toList())
              + " RESTART IDENTITY CASCADE");
    }
    GREEN_MAIL.purgeEmailFromAllMailboxes();
  }
}
