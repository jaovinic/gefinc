package com.jvtech.gefinc.admin.audit;

import java.util.Optional;
import org.springframework.data.repository.Repository;

public interface AuditLogClientRepository extends Repository<AuditLogClient, Long> {

  AuditLogClient save(AuditLogClient client);

  Optional<AuditLogClient> findById(Long auditId);
}
