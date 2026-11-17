package com.jvtech.gefinc.admin.user;

import java.time.Instant;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Persiste tentativas incorretas ou expiração de pendências em transação própria ({@code
 * REQUIRES_NEW}), garantindo que a contagem de falhas não seja desfeita pelo rollback da resposta
 * de erro.
 */
@Component
public class EmailChangeAttemptRecorder {

  private final PendingEmailChangeRepository repository;

  public EmailChangeAttemptRecorder(PendingEmailChangeRepository repository) {
    this.repository = repository;
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public int recordFailure(long pendingId, Instant now) {
    PendingEmailChange pending = repository.findById(pendingId).orElse(null);
    if (pending != null) {
      pending.recordFailure(now);
      repository.saveAndFlush(pending);
      return pending.getAttempts();
    }
    return 0;
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void markExpired(long pendingId, Instant now) {
    PendingEmailChange pending = repository.findById(pendingId).orElse(null);
    if (pending != null) {
      pending.expire(now);
      repository.saveAndFlush(pending);
    }
  }
}
