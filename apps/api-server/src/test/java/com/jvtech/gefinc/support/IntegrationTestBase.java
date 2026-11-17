package com.jvtech.gefinc.support;

import static org.awaitility.Awaitility.await;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;
import com.jvtech.gefinc.auth.LoginAttemptLimiter;
import com.jvtech.gefinc.auth.PasswordResetRateLimiter;
import com.jvtech.gefinc.common.ratelimit.PerKeyRateLimiter;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.ThreadPoolExecutor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Base dos testes de integração: PostgreSQL 16 real (Testcontainers) com as migrações Flyway reais,
 * e-mail capturado pelo GreenMail e relógio controlável (Princípio IV).
 *
 * <p>O reset entre testes trunca todas as tabelas de {@code public} dentro de uma transação com
 * {@code SET LOCAL session_replication_role = replica}: assim os gatilhos de imutabilidade (como o
 * de {@code TRUNCATE} da auditoria) não impedem a limpeza. O {@code SET LOCAL} é desfeito sozinho
 * no fim da transação, de modo que a conexão devolvida ao pool nunca fica em modo {@code replica} e
 * os testes de gatilho não passam em falso. O usuário do contêiner é superusuário, requisito do
 * parâmetro. Depois do reset, {@link AdminSeed#restore} recoloca as sementes das migrações (motivos
 * de exclusão e parâmetros), que o {@code TRUNCATE} apaga.
 *
 * <p>Usuários criados direto no banco por {@code AdminSeed} não passam pelo cadastro (sem
 * categorias padrão); use {@code TestUsers.registerAndLogin} quando o teste precisar de dados
 * financeiros.
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
  @Autowired private ThreadPoolTaskExecutor mailExecutor;
  @Autowired private PlatformTransactionManager transactionManager;
  @Autowired private List<PerKeyRateLimiter> perKeyRateLimiters;
  @Autowired private PasswordEncoder passwordEncoder;

  @Autowired(required = false)
  private com.jvtech.gefinc.admin.parameter.SystemParameterService systemParameterService;

  @Autowired private MeterRegistry meterRegistry;

  /**
   * Valor atual de um contador Micrometer (0 se ainda não existe). O registro não é limpo entre os
   * testes: compare por diferença (antes e depois) e os serviços devem obter o contador sob demanda
   * ({@code registry.counter(...)}), nunca guardar a instância.
   */
  protected double counter(String name, String... tags) {
    Counter counter = meterRegistry.find(name).tags(tags).counter();
    return counter == null ? 0 : counter.count();
  }

  /** Cria usuários, administradores e o raiz direto no banco. */
  protected AdminSeed seed;

  private static volatile boolean superuserChecked;

  @BeforeEach
  void resetState() throws Exception {
    seed = new AdminSeed(jdbc, passwordEncoder, transactionManager);
    // E-mails são enviados em segundo plano: aguarda os do teste anterior para não vazarem.
    awaitPendingMails();
    clock.set(TestClockConfig.START);
    passwordResetRateLimiter.clear();
    loginAttemptLimiter.clear();
    perKeyRateLimiters.forEach(PerKeyRateLimiter::clear);
    truncateAllTables();
    AdminSeed.restore(jdbc);
    if (systemParameterService != null) {
      systemParameterService.invalidateCache();
    }
    GREEN_MAIL.purgeEmailFromAllMailboxes();
  }

  private void truncateAllTables() {
    requireSuperuser();
    List<String> tables =
        jdbc.queryForList(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
                + " AND tablename <> 'flyway_schema_history'",
            String.class);
    if (tables.isEmpty()) {
      return;
    }
    String truncate =
        "TRUNCATE TABLE "
            + String.join(", ", tables.stream().map(t -> "\"" + t + "\"").toList())
            + " RESTART IDENTITY CASCADE";
    new TransactionTemplate(transactionManager)
        .executeWithoutResult(
            status -> {
              jdbc.execute("SET LOCAL session_replication_role = replica");
              jdbc.execute(truncate);
            });
  }

  private void requireSuperuser() {
    if (superuserChecked) {
      return;
    }
    Boolean superuser =
        jdbc.queryForObject(
            "SELECT rolsuper FROM pg_roles WHERE rolname = current_user", Boolean.class);
    if (!Boolean.TRUE.equals(superuser)) {
      throw new IllegalStateException(
          "O reset dos testes exige superusuário no PostgreSQL (session_replication_role).");
    }
    superuserChecked = true;
  }

  @AfterEach
  void drainMailExecutor() {
    // Garante que envios em segundo plano terminem antes de o GreenMail encerrar ou outro teste
    // começar.
    awaitPendingMails();
  }

  protected void awaitPendingMails() {
    ThreadPoolExecutor pool = mailExecutor.getThreadPoolExecutor();
    await()
        .atMost(Duration.ofSeconds(15))
        .until(() -> pool.getCompletedTaskCount() == pool.getTaskCount());
  }
}
