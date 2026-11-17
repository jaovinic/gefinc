package com.jvtech.gefinc.admin.deletion;

import com.jvtech.gefinc.admin.audit.ActorKind;
import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.audit.AuditEntry;
import com.jvtech.gefinc.admin.audit.AuditService;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Remoção definitiva e anonimização de conta de usuário (US10, SC-012, SC-021). Executa remoção em
 * cascata dos dados financeiros e pessoais no banco, preserva o e-mail retido apenas em
 * pending_communications (30 dias), zera recipient_email em email_deliveries e audita
 * ACCOUNT_ERASED.
 */
@Service
public class AccountErasureService {

  private static final Logger log = LoggerFactory.getLogger(AccountErasureService.class);
  public static final Duration RETAINED_EMAIL_DURATION = Duration.ofDays(30);

  private final UserRepository users;
  private final AccountDeletionRequestRepository deletionRequests;
  private final PendingCommunicationRepository pendingCommunications;
  private final AuditService audit;
  private final JdbcTemplate jdbc;
  private final Clock clock;

  public AccountErasureService(
      UserRepository users,
      AccountDeletionRequestRepository deletionRequests,
      PendingCommunicationRepository pendingCommunications,
      AuditService audit,
      JdbcTemplate jdbc,
      Clock clock) {
    this.users = users;
    this.deletionRequests = deletionRequests;
    this.pendingCommunications = pendingCommunications;
    this.audit = audit;
    this.jdbc = jdbc;
    this.clock = clock;
  }

  /**
   * Executa a remoção e anonimização completa de um usuário com solicitação ativa ou imediata.
   *
   * @param target Usuário carregado para remoção.
   * @param request Solicitação correspondente no livro-razão.
   * @param actorKind Tipo do ator (ADMIN se imediata pelo painel, SYSTEM se executada por job).
   * @param actorId Id do administrador se ADMIN, ou nulo se SYSTEM.
   * @param justification Justificativa (apenas para a trilha de auditoria).
   */
  @Transactional
  public void erase(
      User target,
      AccountDeletionRequest request,
      ActorKind actorKind,
      Long actorId,
      String justification) {
    long userId = target.getId();
    String email = target.getEmail();
    Instant now = clock.instant();

    // 1. Atualiza solicitações no livro-razão
    if (request != null) {
      if (request.isScheduled()) {
        request.execute(now);
        deletionRequests.save(request);
      }
    }

    // 2. Retém e-mail apenas nas comunicações pendentes (30 dias)
    List<PendingCommunication> pending =
        pendingCommunications.findByUserIdAndState(userId, PendingCommunication.STATE_PENDING);
    Instant retainedUntil = now.plus(RETAINED_EMAIL_DURATION);
    for (PendingCommunication comm : pending) {
      comm.retainEmail(email, retainedUntil);
      pendingCommunications.save(comm);
    }

    // 3. Sanitiza histórico de envios de e-mail (zera recipient_email da conta removida)
    jdbc.update("UPDATE email_deliveries SET recipient_email = NULL WHERE user_id = ?", userId);

    // 4. Apaga a conta do usuário (PostgreSQL remove em cascata dados financeiros, sessões, etc.)
    users.delete(target);
    users.flush();

    // 5. Audita ACCOUNT_ERASED com target_user_id (consultas futuras mostrarão rótulo anônimo)
    AuditEntry entry =
        AuditEntry.builder(AuditAction.ACCOUNT_ERASED)
            .actor(actorKind, actorId)
            .target(userId)
            .reasonText(justification)
            .build();
    audit.record(entry);

    log.info("Usuário {} apagado definitivamente e anonimizado por {}.", userId, actorKind);
  }

  /**
   * Executa a remoção de todas as contas cuja exclusão agendada já venceu (due_at <= now).
   * Idempotente, seguro contra concorrência e usado pelo AccountDeletionJob.
   */
  @Transactional
  public int eraseExpiredDue() {
    Instant now = clock.instant();
    List<AccountDeletionRequest> due = deletionRequests.findDueScheduled(now);
    int count = 0;
    for (AccountDeletionRequest req : due) {
      User user = users.findForUpdate(req.getUserId()).orElse(null);
      if (user != null) {
        erase(user, req, ActorKind.SYSTEM, null, null);
        count++;
      } else {
        // Usuário já não existe no banco, apenas finaliza o livro-razão se ainda SCHEDULED
        req.execute(now);
        deletionRequests.save(req);
      }
    }
    return count;
  }
}
