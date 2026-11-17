package com.jvtech.gefinc.admin.invitation;

import java.time.Clock;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Rotina horária que expira convites pendentes com validade vencida e zera o e-mail em claro,
 * respeitando a restrição {@code ck_inv_email}.
 */
@Component
public class InvitationExpiryJob {

  private static final Logger log = LoggerFactory.getLogger(InvitationExpiryJob.class);

  private final InvitationRepository invitations;
  private final Clock clock;

  public InvitationExpiryJob(InvitationRepository invitations, Clock clock) {
    this.invitations = invitations;
    this.clock = clock;
  }

  @Scheduled(cron = "0 0 * * * *")
  @Transactional
  public int run() {
    Instant now = clock.instant();
    int count =
        invitations.expirePendingBefore(InvitationStatus.PENDING, InvitationStatus.EXPIRED, now);
    if (count > 0) {
      log.info("Convites de cadastro expirados e e-mails zerados: {}", count);
    }
    return count;
  }
}
