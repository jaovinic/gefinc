package com.jvtech.gefinc.admin.audit;

import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.security.RequestOriginProvider;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Registra a tentativa de um usuário reverter uma decisão administrativa (conta suspensa ou
 * exclusão pedida por um administrador): login, renovação, cancelamento da exclusão. É o ponto de
 * entrada pequeno que o módulo {@code auth} usa, sem enxergar entidades do painel. A linha é
 * gravada em transação própria (sobrevive ao rollback do pedido recusado) e deduplicada em 15
 * minutos por usuário, IP e decisão, então o mesmo IP tentando por canais diferentes gera um único
 * registro; as repetições só incrementam um contador. O IP e o dispositivo ficam só em {@code
 * audit_log_client}. Falha ao registrar nunca muda a resposta ao usuário.
 */
@Component
public class AdminDecisionAuditor {

  private static final Logger log = LoggerFactory.getLogger(AdminDecisionAuditor.class);
  static final String FAILED = "gefinc.admin.revert_attempt.failed";

  /** A decisão que o usuário tentou reverter e o código da recusa que ele recebe. */
  public enum Decision {
    SUSPENSION(ErrorCode.ACCOUNT_SUSPENDED),
    ADMIN_DELETION(ErrorCode.ADMIN_DECISION_LOCKED);

    private final ErrorCode refusal;

    Decision(ErrorCode refusal) {
      this.refusal = refusal;
    }

    ErrorCode refusal() {
      return refusal;
    }
  }

  private final AuditService audit;
  private final RequestOriginProvider origins;
  private final MeterRegistry registry;

  public AdminDecisionAuditor(
      AuditService audit, RequestOriginProvider origins, MeterRegistry registry) {
    this.audit = audit;
    this.origins = origins;
    this.registry = registry;
  }

  public void revertAttempt(long userId, Decision decision) {
    try {
      AuditEntry entry =
          AuditEntry.builder(AuditAction.REVERT_ATTEMPT)
              .actor(ActorKind.USER, userId)
              .target(userId)
              .refusal(decision.refusal().name())
              .build();
      audit.recordAttempt(entry, origins.current(), userId + ":" + decision.name());
    } catch (RuntimeException failure) {
      // Só a classe: a mensagem poderia conter dado pessoal.
      log.error(
          "Falha ao registrar a tentativa de reverter decisão administrativa: {}",
          failure.getClass().getSimpleName());
      registry.counter(FAILED).increment();
    }
  }
}
