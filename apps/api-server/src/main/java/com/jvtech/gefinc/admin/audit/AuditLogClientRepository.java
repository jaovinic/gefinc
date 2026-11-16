package com.jvtech.gefinc.admin.audit;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

/**
 * Grava, lê por {@code auditId} e expurga em lotes as linhas de visitantes ({@code user_id IS
 * NULL}) com mais de 90 dias.
 */
public interface AuditLogClientRepository extends Repository<AuditLogClient, Long> {

  AuditLogClient save(AuditLogClient client);

  Optional<AuditLogClient> findById(Long auditId);

  @Transactional
  @Modifying
  @Query(
      value =
          """
          DELETE FROM audit_log_client
          WHERE audit_id IN (
              SELECT audit_id FROM audit_log_client
              WHERE user_id IS NULL AND created_at < :limit
              ORDER BY created_at
              LIMIT :batch
          )
          """,
      nativeQuery = true)
  int deleteVisitorBatch(@Param("limit") Instant limit, @Param("batch") int batch);

  default int deleteVisitorBatchBefore(Instant limit, int batch) {
    return deleteVisitorBatch(limit, batch);
  }
}
