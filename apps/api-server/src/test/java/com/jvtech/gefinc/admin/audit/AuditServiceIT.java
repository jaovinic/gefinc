package com.jvtech.gefinc.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.logging.CorrelationIdFilter;
import com.jvtech.gefinc.common.security.AuthenticatedUser;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.common.security.RequestOrigin;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Gravação da trilha: campos, vazamento, audit-or-rollback e paridade com o banco. */
class AuditServiceIT extends IntegrationTestBase {

  @Autowired private AuditService audit;
  @Autowired private AdminActionExecutor executor;
  @Autowired private Pseudonymizer pseudonymizer;
  @Autowired private PlatformTransactionManager transactionManager;
  @MockitoSpyBean private AuditLogRepository repository;

  @AfterEach
  void clearContext() {
    SecurityContextHolder.clearContext();
    MDC.remove(CorrelationIdFilter.MDC_KEY);
  }

  private <T> T inTransaction(java.util.function.Supplier<T> body) {
    return new TransactionTemplate(transactionManager).execute(status -> body.get());
  }

  private void authenticateAs(long userId) {
    SecurityContextHolder.getContext()
        .setAuthentication(
            new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(userId), null, List.of()));
  }

  private long count() {
    return jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class);
  }

  @Test
  void gravaAcaoComAtorAlvoResultadoJustificativaEDetalhes() {
    SeededUser admin = seed.createAdmin("adm@example.com");
    SeededUser target = seed.createUser("alvo@example.com");
    MDC.put(CorrelationIdFilter.MDC_KEY, "r".repeat(50));
    AuditEntry entry =
        AuditEntry.builder(AuditAction.PARAMETER_CHANGED)
            .actor(ActorKind.ADMIN, admin.id())
            .target(target.id())
            .subject("SIGNUPS_OPEN")
            .reasonText("Pedido do titular, protocolo 12")
            .details(AuditDetails.of().put(AuditKey.FROM, "true").put(AuditKey.TO, "false"))
            .build();

    long id = inTransaction(() -> audit.record(entry));

    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM audit_log WHERE id = ?", id);
    assertThat(row)
        .containsEntry("action", "PARAMETER_CHANGED")
        .containsEntry("result", "SUCCESS")
        .containsEntry("actor_kind", "ADMIN")
        .containsEntry("actor_user_id", admin.id())
        .containsEntry("target_user_id", target.id())
        .containsEntry("subject", "SIGNUPS_OPEN")
        .containsEntry("reason_text", "Pedido do titular, protocolo 12")
        .containsEntry("request_id", "r".repeat(40));
    assertThat(row.get("refusal_code")).isNull();
    assertThat(row.get("client_ref")).isNull();
    assertThat(row.get("dedupe_key")).isNull();
    assertThat(((java.sql.Timestamp) row.get("occurred_at")).toInstant())
        .isEqualTo(clock.instant());
    assertThat(
            jdbc.queryForObject(
                "SELECT details::text FROM audit_log WHERE id = ?", String.class, id))
        .contains("\"from\": \"true\"")
        .contains("\"to\": \"false\"");
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log_client", Long.class)).isZero();
  }

  @Test
  void recordExigeTransacaoDaAcao() {
    AuditEntry entry = AuditEntry.builder(AuditAction.USER_SUSPENDED).build();

    assertThatThrownBy(() -> audit.record(entry))
        .isInstanceOf(IllegalTransactionStateException.class);
    assertThat(count()).isZero();
  }

  @Test
  void varreduraDeVazamentoNaoEncontraDadoPessoalNasLinhasGeradas() {
    SeededUser admin = seed.createAdmin("adm@example.com");
    SeededUser target = seed.createUser("alvo@example.com");
    AuditDetails details =
        AuditDetails.of()
            .put(AuditKey.FIELD, "name")
            .put(AuditKey.FROM, "ACTIVE")
            .put(AuditKey.TO, "SUSPENDED")
            .put(AuditKey.EMAIL_REF, pseudonymizer.emailRef("novo@example.com"))
            .put(AuditKey.OLD_EMAIL_REF, pseudonymizer.emailRef("alvo@example.com"))
            .put(AuditKey.OLD_NAME_REF, pseudonymizer.nameRef("Ana Souza"))
            .put(AuditKey.DAYS, 7)
            .put(AuditKey.MODE, "GRACE")
            .put(AuditKey.REASON_ID, 2)
            .put(AuditKey.PARAMETER, "MAINTENANCE_ENABLED")
            .put(AuditKey.COUNT, 3)
            .put(AuditKey.REQUEST_ID, 41);
    for (AuditAction action : AuditAction.values()) {
      AuditEntry entry =
          AuditEntry.builder(action)
              .actor(ActorKind.ADMIN, admin.id())
              .target(target.id())
              .subject("rota:/admin/users/{id}")
              .details(details)
              .build();
      inTransaction(() -> audit.record(entry));
    }
    audit.recordAttempt(
        AuditEntry.builder(AuditAction.ACCESS_DENIED)
            .actor(ActorKind.ADMIN, admin.id())
            .refusal("REAUTH_FAILED")
            .build(),
        new RequestOrigin("203.0.113.7", "Chrome em Windows", "WEB"),
        "alvo");

    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT details::text AS details, subject, refusal_code, client_ref, dedupe_key,"
                + " request_id FROM audit_log");
    assertThat(rows).hasSize(AuditAction.values().length + 1);
    List<Pattern> forbidden =
        List.of(
            Pattern.compile("@"),
            Pattern.compile("\\b\\d{6}\\b"),
            Pattern.compile("http", Pattern.CASE_INSENSITIVE),
            Pattern.compile("bearer|token|senha|password", Pattern.CASE_INSENSITIVE),
            Pattern.compile("R\\$"),
            Pattern.compile("\\d+[.,]\\d{2}\\b"),
            Pattern.compile("\\b\\d{1,3}(\\.\\d{1,3}){3}\\b"));
    for (Map<String, Object> row : rows) {
      String text = String.valueOf(row);
      for (Pattern pattern : forbidden) {
        assertThat(pattern.matcher(text).find()).as("%s em %s", pattern, text).isFalse();
      }
    }
  }

  @Test
  void referenciasSaoHmacENaoOIpNemOsComponentesDaChave() {
    SeededUser admin = seed.createAdmin("adm@example.com");

    audit.recordAttempt(
        AuditEntry.builder(AuditAction.ACCESS_DENIED)
            .actor(ActorKind.ADMIN, admin.id())
            .subject("rota")
            .refusal("REAUTH_FAILED")
            .build(),
        new RequestOrigin("203.0.113.7", "Chrome em Windows", "WEB"),
        "9");

    Map<String, Object> row = jdbc.queryForMap("SELECT client_ref, dedupe_key FROM audit_log");
    assertThat((String) row.get("client_ref"))
        .isEqualTo(pseudonymizer.ipRef("203.0.113.7"))
        .matches("[0-9a-f]{32}");
    assertThat((String) row.get("dedupe_key")).matches("[0-9a-f]{32}");
    assertThat(String.valueOf(row)).doesNotContain("203.0.113.7");
    Map<String, Object> client = jdbc.queryForMap("SELECT * FROM audit_log_client");
    assertThat(client)
        .containsEntry("ip", "203.0.113.7")
        .containsEntry("device_label", "Chrome em Windows")
        .containsEntry("user_id", admin.id());
  }

  @Test
  void auditOrRollbackFalhaDaTrilhaDesfazAAlteracaoDaAcao() {
    SeededUser admin = seed.createAdmin("adm@example.com");
    SeededUser target = seed.createUser("alvo@example.com");
    authenticateAs(admin.id());
    doThrow(new IllegalStateException("trilha indisponível"))
        .when(repository)
        .save(any(AuditLog.class));
    AuditContext ctx =
        new AuditContext(AuditAction.USER_RENAMED, target.id(), null, null, AuditDetails::of);

    assertThatThrownBy(
            () ->
                executor.run(
                    ctx,
                    () ->
                        jdbc.update(
                            "UPDATE users SET name = 'Alterado' WHERE id = ?", target.id())))
        .isInstanceOf(IllegalStateException.class);

    assertThat(
            jdbc.queryForObject("SELECT name FROM users WHERE id = ?", String.class, target.id()))
        .isNull();
    assertThat(count()).isZero();
  }

  @Test
  void sucessoGravaAAlteracaoEATrilhaNaMesmaTransacao() {
    SeededUser admin = seed.createAdmin("adm@example.com");
    SeededUser target = seed.createUser("alvo@example.com");
    authenticateAs(admin.id());
    AuditContext ctx =
        new AuditContext(
            AuditAction.USER_RENAMED,
            target.id(),
            null,
            "correção solicitada",
            () -> AuditDetails.of().put(AuditKey.FIELD, "name"));

    String result =
        executor.run(
            ctx,
            () -> {
              jdbc.update("UPDATE users SET name = 'Novo' WHERE id = ?", target.id());
              return "ok";
            });

    assertThat(result).isEqualTo("ok");
    assertThat(
            jdbc.queryForObject("SELECT name FROM users WHERE id = ?", String.class, target.id()))
        .isEqualTo("Novo");
    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM audit_log");
    assertThat(row)
        .containsEntry("action", "USER_RENAMED")
        .containsEntry("result", "SUCCESS")
        .containsEntry("actor_user_id", admin.id())
        .containsEntry("target_user_id", target.id())
        .containsEntry("reason_text", "correção solicitada");
  }

  @Test
  void recusaDeRegraPersisteMesmoComRollbackDaAcaoERelancaAMesmaExcecao() {
    SeededUser admin = seed.createAdmin("adm@example.com");
    SeededUser target = seed.createUser("alvo@example.com");
    authenticateAs(admin.id());
    ApiException refusal =
        new ApiException(ErrorCode.ROOT_PROTECTED, "Administrador raiz protegido.");
    AuditContext ctx =
        new AuditContext(
            AuditAction.USER_SUSPENDED, target.id(), null, "tentativa", AuditDetails::of);

    assertThatThrownBy(
            () ->
                executor.run(
                    ctx,
                    () -> {
                      jdbc.update("UPDATE users SET name = 'Parcial' WHERE id = ?", target.id());
                      throw refusal;
                    }))
        .isSameAs(refusal);

    assertThat(
            jdbc.queryForObject("SELECT name FROM users WHERE id = ?", String.class, target.id()))
        .isNull();
    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM audit_log");
    assertThat(row)
        .containsEntry("action", "USER_SUSPENDED")
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "ROOT_PROTECTED")
        .containsEntry("actor_user_id", admin.id())
        .containsEntry("target_user_id", target.id());
  }

  @Test
  void cadaRecusaDeRegraStatus403409e422EhAuditadaMasOutrasFalhasNao() {
    SeededUser admin = seed.createAdmin("adm@example.com");
    authenticateAs(admin.id());
    AuditContext ctx =
        new AuditContext(AuditAction.USER_SUSPENDED, null, null, null, AuditDetails::of);
    for (ErrorCode code :
        List.of(ErrorCode.ROOT_PROTECTED, ErrorCode.LAST_ADMIN, ErrorCode.INVALID_CONFIRMATION)) {
      assertThatThrownBy(
              () ->
                  executor.run(
                      ctx,
                      () -> {
                        throw new ApiException(code, "x");
                      }))
          .isInstanceOf(ApiException.class);
    }
    assertThat(count()).isEqualTo(3);

    assertThatThrownBy(
            () ->
                executor.run(
                    ctx,
                    () -> {
                      throw new ApiException(ErrorCode.NOT_FOUND, "x");
                    }))
        .isInstanceOf(ApiException.class);
    assertThatThrownBy(
            () ->
                executor.run(
                    ctx,
                    () -> {
                      throw new IllegalStateException("x");
                    }))
        .isInstanceOf(IllegalStateException.class);
    assertThat(count()).isEqualTo(3);
  }

  @Test
  void falhaAoGravarARecusaRelancaARecusaOriginalSemVazarDados() {
    SeededUser admin = seed.createAdmin("adm@example.com");
    SeededUser target = seed.createUser("alvo@example.com");
    authenticateAs(admin.id());
    doThrow(new IllegalStateException("alvo@example.com"))
        .when(repository)
        .save(any(AuditLog.class));
    ApiException refusal = new ApiException(ErrorCode.LAST_ADMIN, "Último administrador.");
    AuditContext ctx =
        new AuditContext(AuditAction.ROLE_REVOKED, target.id(), null, null, AuditDetails::of);
    double before = counter("gefinc.admin.audit.refusal_failed");

    assertThatThrownBy(
            () ->
                executor.run(
                    ctx,
                    () -> {
                      throw refusal;
                    }))
        .isSameAs(refusal);

    assertThat(counter("gefinc.admin.audit.refusal_failed") - before).isEqualTo(1.0);
    assertThat(count()).isZero();
  }

  @Test
  void recordRefusalPersisteMesmoQuandoATransacaoExternaFazRollback() {
    SeededUser admin = seed.createAdmin("adm@example.com");
    AuditEntry entry =
        AuditEntry.builder(AuditAction.USER_SUSPENDED)
            .actor(ActorKind.ADMIN, admin.id())
            .refusal("SELF_ACTION_FORBIDDEN")
            .build();

    new TransactionTemplate(transactionManager)
        .executeWithoutResult(
            status -> {
              audit.recordRefusal(entry);
              status.setRollbackOnly();
            });

    assertThat(count()).isEqualTo(1);
  }

  @Test
  void catalogoDeAcoesTemParidadeComARestricaoDoBanco() {
    for (AuditAction action : AuditAction.values()) {
      jdbc.update(
          "INSERT INTO audit_log (action, result, actor_kind) VALUES (?, 'SUCCESS', 'SYSTEM')",
          action.name());
    }
    assertThat(count()).isEqualTo(AuditAction.values().length);

    String definition =
        jdbc.queryForObject(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_al_action'",
            String.class);
    long literals = Pattern.compile("'[A-Z_]+'::").matcher(definition).results().count();
    assertThat(literals).isEqualTo(AuditAction.values().length);
    for (AuditAction action : AuditAction.values()) {
      assertThat(definition).contains("'" + action.name() + "'");
    }
  }
}
