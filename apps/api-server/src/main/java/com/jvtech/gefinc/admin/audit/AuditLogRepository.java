package com.jvtech.gefinc.admin.audit;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Só grava e consulta: a trilha é imutável, então não há {@code delete*} nem atualização. */
public interface AuditLogRepository extends Repository<AuditLog, Long> {

  AuditLog save(AuditLog entry);

  Optional<AuditLog> findById(Long id);

  boolean existsByDedupeKeyAndOccurredAtAfter(String dedupeKey, Instant after);
}
