package com.jvtech.gefinc.admin.audit;

import com.jvtech.gefinc.common.logging.CorrelationIdFilter;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.common.security.RequestOrigin;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Grava a trilha de auditoria. {@link #record} participa da transação da ação (se a trilha falha, a
 * ação é desfeita: audit-or-rollback); {@link #recordRefusal} e {@link #recordAttempt} usam
 * transação própria, para a recusa permanecer mesmo quando a ação sofre rollback. O instante vem do
 * {@link Clock} injetado, a mesma fonte da janela de deduplicação.
 */
@Service
public class AuditService {

  static final Duration DEDUPE_WINDOW = Duration.ofMinutes(15);
  static final String SUPPRESSED = "gefinc.admin.attempts.suppressed";
  private static final int REQUEST_ID_MAX = 40;

  private final AuditLogRepository audit;
  private final AuditLogClientRepository clients;
  private final Pseudonymizer pseudonymizer;
  private final JdbcTemplate jdbc;
  private final MeterRegistry registry;
  private final Clock clock;

  public AuditService(
      AuditLogRepository audit,
      AuditLogClientRepository clients,
      Pseudonymizer pseudonymizer,
      JdbcTemplate jdbc,
      MeterRegistry registry,
      Clock clock) {
    this.audit = audit;
    this.clients = clients;
    this.pseudonymizer = pseudonymizer;
    this.jdbc = jdbc;
    this.registry = registry;
    this.clock = clock;
  }

  /** Grava na transação da ação, que é obrigatória: sem ela a chamada falha. */
  @Transactional(propagation = Propagation.MANDATORY)
  public long record(AuditEntry entry) {
    return persist(entry, null, null).getId();
  }

  /**
   * Grava a recusa em transação própria, sem deduplicação; persiste mesmo se a ação der rollback.
   */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public long recordRefusal(AuditEntry entry) {
    return persist(entry, null, null).getId();
  }

  /**
   * Grava uma tentativa negada, deduplicada: a mesma tentativa (ator, IP, alvo da decisão e tipo)
   * dentro de 15 minutos gera uma só linha e apenas incrementa o contador. A trava consultiva do
   * banco serializa tentativas concorrentes iguais, inclusive entre instâncias. Devolve {@code
   * true} se gravou. O IP e o dispositivo ficam só em {@code audit_log_client}.
   */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public boolean recordAttempt(AuditEntry entry, RequestOrigin origin, String decisionTarget) {
    String actor = entry.actorUserId() == null ? "V" : "U" + entry.actorUserId();
    String dedupeKey =
        pseudonymizer.dedupeKey(
            actor,
            origin.known() ? origin.ip() : "-",
            decisionTarget == null ? "-" : decisionTarget,
            entry.action().name());
    jdbc.query(
        "SELECT pg_advisory_xact_lock(hashtext(?))", ps -> ps.setString(1, dedupeKey), rs -> {});
    Instant now = clock.instant();
    if (audit.existsByDedupeKeyAndOccurredAtAfter(dedupeKey, now.minus(DEDUPE_WINDOW))) {
      registry.counter(SUPPRESSED, "type", entry.action().name()).increment();
      return false;
    }
    AuditLog saved = persist(entry, origin, dedupeKey);
    if (origin.known()) {
      boolean identified =
          entry.actorKind() == ActorKind.ADMIN || entry.actorKind() == ActorKind.USER;
      clients.save(
          new AuditLogClient(
              saved.getId(),
              identified ? entry.actorUserId() : null,
              origin.ip(),
              origin.deviceLabel(),
              now));
    }
    return true;
  }

  private AuditLog persist(AuditEntry entry, RequestOrigin origin, String dedupeKey) {
    String clientRef = origin != null && origin.known() ? pseudonymizer.ipRef(origin.ip()) : null;
    return audit.save(new AuditLog(clock.instant(), entry, clientRef, dedupeKey, requestId()));
  }

  private static String requestId() {
    String id = MDC.get(CorrelationIdFilter.MDC_KEY);
    if (id == null) {
      return null;
    }
    return id.length() > REQUEST_ID_MAX ? id.substring(0, REQUEST_ID_MAX) : id;
  }
}
