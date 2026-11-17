package com.jvtech.gefinc.admin.deletion;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Rotina periódica que expira comunicações pendentes cujo endereço retido atingiu 30 dias (FR-057).
 */
@Component
public class PendingCommunicationExpiryJob {

  private static final Logger log = LoggerFactory.getLogger(PendingCommunicationExpiryJob.class);

  private final PendingCommunicationRepository pendingRepo;
  private final AccountDeletionRequestRepository deletionRepo;
  private final Clock clock;

  public PendingCommunicationExpiryJob(
      PendingCommunicationRepository pendingRepo,
      AccountDeletionRequestRepository deletionRepo,
      Clock clock) {
    this.pendingRepo = pendingRepo;
    this.deletionRepo = deletionRepo;
    this.clock = clock;
  }

  @Scheduled(cron = "0 0 * * * *")
  @Transactional
  public int run() {
    Instant now = clock.instant();
    List<PendingCommunication> expired = pendingRepo.findExpired(now);
    for (PendingCommunication comm : expired) {
      comm.expire(now);
      pendingRepo.save(comm);

      deletionRepo
          .findById(comm.getDeletionRequestId())
          .ifPresent(
              req -> {
                req.updateNoticeState(AccountDeletionRequest.NOTICE_EXPIRED);
                deletionRepo.save(req);
              });
    }
    if (!expired.isEmpty()) {
      log.info("Comunicações pendentes expiradas: {}", expired.size());
    }
    return expired.size();
  }
}
