package com.jvtech.gefinc.admin.common;

import com.jvtech.gefinc.admin.audit.ActorKind;
import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.audit.AuditDetails;
import com.jvtech.gefinc.admin.audit.AuditEntry;
import com.jvtech.gefinc.admin.audit.AuditService;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.common.security.RequestOriginProvider;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Executa uma ação administrativa com auditoria obrigatória (audit-or-rollback): a alteração e a
 * linha da trilha entram na mesma transação, e a falha de qualquer uma desfaz as duas. Recusas de
 * regra (403, 404, 409 e 422) são gravadas em transação própria, depois do rollback, e a mesma
 * exceção é relançada; a recusa de reautenticação é deduplicada. A recusa 404 (alvo inexistente) é
 * gravada sem alvo: {@code target_user_id} não tem chave estrangeira, e um id que não existe
 * poderia passar a apontar para um usuário criado depois. Outras falhas propagam sem auditoria. O
 * ator vem sempre de {@link CurrentUser}, nunca de parâmetro.
 */
@Component
public class AdminActionExecutor {

  private static final Logger log = LoggerFactory.getLogger(AdminActionExecutor.class);
  static final String REFUSAL_FAILED = "gefinc.admin.audit.refusal_failed";

  /**
   * O que auditar. {@code details} só é avaliado quando a ação conclui; {@code reasonText} é a
   * justificativa livre do administrador (a única parte livre da trilha).
   */
  public record AuditContext(
      AuditAction action,
      Long targetUserId,
      String subject,
      String reasonText,
      Supplier<AuditDetails> details) {}

  private final AuditService audit;
  private final RequestOriginProvider origins;
  private final MeterRegistry registry;
  private final TransactionTemplate transaction;

  public AdminActionExecutor(
      AuditService audit,
      RequestOriginProvider origins,
      MeterRegistry registry,
      PlatformTransactionManager transactionManager) {
    this.audit = audit;
    this.origins = origins;
    this.registry = registry;
    this.transaction = new TransactionTemplate(transactionManager);
  }

  public <T> T run(AuditContext ctx, Supplier<T> body) {
    long adminId = CurrentUser.id();
    try {
      // O PostgreSQL recusa NUL em texto: a justificativa com NUL é recusada antes de qualquer
      // efeito.
      if (AuditEntry.hasNul(ctx.reasonText())) {
        throw ApiException.validation("Há campos inválidos.")
            .withFieldError("reason", "O texto contém caracteres inválidos.");
      }
      return transaction.execute(
          status -> {
            T result = body.get();
            audit.record(successEntry(adminId, ctx));
            return result;
          });
    } catch (ApiException e) {
      if (isRuleRefusal(e)) {
        recordRefusal(adminId, ctx, e);
      } else if (e.code() == ErrorCode.MAIL_DELIVERY_FAILED) {
        recordFailure(adminId, ctx, e);
      }
      throw e;
    }
  }

  public <T> T runWithDynamicTarget(
      AuditAction action,
      java.util.concurrent.atomic.AtomicReference<Long> targetUserIdRef,
      String subject,
      Supplier<T> body) {
    long adminId = CurrentUser.id();
    try {
      return transaction.execute(
          status -> {
            T result = body.get();
            AuditContext resolved =
                new AuditContext(action, targetUserIdRef.get(), subject, null, null);
            audit.record(successEntry(adminId, resolved));
            return result;
          });
    } catch (ApiException e) {
      AuditContext resolved = new AuditContext(action, targetUserIdRef.get(), subject, null, null);
      if (isRuleRefusal(e)) {
        recordRefusal(adminId, resolved, e);
      } else if (e.code() == ErrorCode.MAIL_DELIVERY_FAILED) {
        recordFailure(adminId, resolved, e);
      }
      throw e;
    }
  }

  private static AuditEntry successEntry(long adminId, AuditContext ctx) {
    AuditDetails details = ctx.details() == null ? null : ctx.details().get();
    return AuditEntry.builder(ctx.action())
        .actor(ActorKind.ADMIN, adminId)
        .target(ctx.targetUserId())
        .subject(ctx.subject())
        .reasonText(ctx.reasonText())
        .details(details)
        .build();
  }

  private static boolean isRuleRefusal(ApiException e) {
    HttpStatus status = e.code().status();
    return status == HttpStatus.FORBIDDEN
        || status == HttpStatus.NOT_FOUND
        || status == HttpStatus.CONFLICT
        || status == HttpStatus.UNPROCESSABLE_ENTITY
        || status == HttpStatus.TOO_MANY_REQUESTS;
  }

  private void recordFailure(long adminId, AuditContext ctx, ApiException failure) {
    try {
      AuditEntry entry =
          AuditEntry.builder(ctx.action())
              .actor(ActorKind.ADMIN, adminId)
              .target(ctx.targetUserId())
              .subject(ctx.subject())
              .reasonText(AuditEntry.hasNul(ctx.reasonText()) ? null : ctx.reasonText())
              .failure(failure.code().name())
              .build();
      audit.recordRefusal(entry);
    } catch (RuntimeException err) {
      log.error("Falha ao registrar a falha administrativa: {}", err.getClass().getSimpleName());
      registry.counter(REFUSAL_FAILED).increment();
    }
  }

  private void recordRefusal(long adminId, AuditContext ctx, ApiException refusal) {
    try {
      AuditEntry entry =
          AuditEntry.builder(ctx.action())
              .actor(ActorKind.ADMIN, adminId)
              .target(refusal.code() == ErrorCode.NOT_FOUND ? null : ctx.targetUserId())
              .subject(ctx.subject())
              .reasonText(AuditEntry.hasNul(ctx.reasonText()) ? null : ctx.reasonText())
              .refusal(refusal.code().name())
              .build();
      if (refusal.code() == ErrorCode.REAUTH_FAILED) {
        audit.recordAttempt(entry, origins.current(), decisionTarget(ctx));
      } else {
        audit.recordRefusal(entry);
      }
    } catch (RuntimeException failure) {
      // Só a classe: a mensagem poderia conter dado pessoal. A recusa original segue para o
      // cliente.
      log.error(
          "Falha ao registrar a recusa administrativa: {}", failure.getClass().getSimpleName());
      registry.counter(REFUSAL_FAILED).increment();
    }
  }

  private static String decisionTarget(AuditContext ctx) {
    if (ctx.targetUserId() != null) {
      return Long.toString(ctx.targetUserId());
    }
    return ctx.subject() == null ? "-" : ctx.subject();
  }
}
