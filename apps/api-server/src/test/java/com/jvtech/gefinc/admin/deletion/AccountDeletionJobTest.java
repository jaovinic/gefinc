package com.jvtech.gefinc.admin.deletion;

import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.auth.AccountDeletionJob;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Testes da rotina agendada de exclusão definitiva (T138): roda a cada 5 minutos sobre due_at <=
 * now(), funciona como rede de segurança e é idempotente (repetir a execução não falha nem duplica
 * efeito).
 */
class AccountDeletionJobTest extends IntegrationTestBase {

  @Autowired private AccountDeletionJob job;
  @Autowired private AccountDeletionRequestRepository deletionRepo;

  private TestUsers users;
  private SeededUser admin;

  @BeforeEach
  void setUp() {
    users = new TestUsers(mockMvc, objectMapper);
    admin = seed.createAdmin("adm@job.com");
  }

  @Test
  void executaExclusoesComDueAtVencidoEMantemAsNaoVencidas() throws Exception {
    TestUser vencido = users.registerAndLogin("vencido@job.com");
    TestUser noPrazo = users.registerAndLogin("noprazo@job.com");

    Instant now = clock.instant();

    // Cria requisição vencida (due_at no passado)
    AccountDeletionRequest reqVencida =
        AccountDeletionRequest.forAdmin(
            vencido.id(),
            "ref-vencido",
            AccountDeletionRequest.MODE_GRACE,
            5,
            now.minus(Duration.ofDays(6)),
            now.minus(Duration.ofDays(1)),
            admin.id(),
            1L,
            "Solicitação do titular dos dados",
            "Mensagem genérica",
            null);
    deletionRepo.save(reqVencida);
    jdbc.update(
        "UPDATE users SET deletion_requested_at = ?, deletion_due_at = ?, deletion_origin = 'ADMIN', deletion_request_id = ? WHERE id = ?",
        java.sql.Timestamp.from(now.minus(Duration.ofDays(6))),
        java.sql.Timestamp.from(now.minus(Duration.ofDays(1))),
        reqVencida.getId(),
        vencido.id());

    // Cria requisição no prazo (due_at no futuro)
    AccountDeletionRequest reqNoPrazo =
        AccountDeletionRequest.forAdmin(
            noPrazo.id(),
            "ref-noprazo",
            AccountDeletionRequest.MODE_GRACE,
            5,
            now,
            now.plus(Duration.ofDays(5)),
            admin.id(),
            1L,
            "Solicitação do titular dos dados",
            "Mensagem genérica",
            null);
    deletionRepo.save(reqNoPrazo);
    jdbc.update(
        "UPDATE users SET deletion_requested_at = ?, deletion_due_at = ?, deletion_origin = 'ADMIN', deletion_request_id = ? WHERE id = ?",
        java.sql.Timestamp.from(now),
        java.sql.Timestamp.from(now.plus(Duration.ofDays(5))),
        reqNoPrazo.getId(),
        noPrazo.id());

    job.run();

    // Vencido foi removido
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE id = ?", Long.class, vencido.id()))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM account_deletion_requests WHERE id = ?",
                String.class,
                reqVencida.getId()))
        .isEqualTo("EXECUTED");

    // No prazo continua ativo
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE id = ?", Long.class, noPrazo.id()))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM account_deletion_requests WHERE id = ?",
                String.class,
                reqNoPrazo.getId()))
        .isEqualTo("SCHEDULED");
  }

  @Test
  void execucaoEhIdempotenteQuandoNaoHaNadaParaExcluir() {
    job.run();
    job.run();
  }
}
