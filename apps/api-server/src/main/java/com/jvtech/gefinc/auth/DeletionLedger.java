package com.jvtech.gefinc.auth;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Ponte mínima entre a exclusão por autoatendimento e o livro-razão {@code
 * account_deletion_requests}: as colunas de exclusão de {@code users} só são coerentes (restrição
 * {@code ck_users_deletion_consistent}) se apontam para uma linha do livro-razão. Escreve por JDBC,
 * na transação do chamador. O modelo completo (administrador, antecipação, avisos) substitui esta
 * ponte na entrega das exclusões administrativas (T142).
 */
@Component
public class DeletionLedger {

  private final JdbcTemplate jdbc;

  public DeletionLedger(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** Abre a solicitação do próprio usuário (carência de 30 dias, sem aviso) e devolve o id. */
  public long openUserRequest(long userId, String userRef, Instant requestedAt, Instant dueAt) {
    Long id =
        jdbc.queryForObject(
            "INSERT INTO account_deletion_requests (user_id, target_ref, origin, mode, grace_days,"
                + " requested_at, due_at, status, notice_state) VALUES (?, ?, 'USER', 'GRACE', 30,"
                + " ?, ?, 'SCHEDULED', 'NOT_APPLICABLE') RETURNING id",
            Long.class,
            userId,
            userRef,
            Timestamp.from(requestedAt),
            Timestamp.from(dueAt));
    return id;
  }

  public void markCanceled(long requestId, Instant at) {
    jdbc.update(
        "UPDATE account_deletion_requests SET status = 'CANCELED', canceled_at = ?"
            + " WHERE id = ? AND status = 'SCHEDULED'",
        Timestamp.from(at),
        requestId);
  }

  /**
   * Marca como executadas as solicitações ativas dos usuários cuja carência venceu (as mesmas
   * contas que {@code UserRepository.deleteExpiredDeletions} apaga em seguida, na mesma transação).
   */
  public int markExecutedDue(Instant limit, Instant at) {
    return jdbc.update(
        "UPDATE account_deletion_requests SET status = 'EXECUTED', executed_at = ?"
            + " WHERE status = 'SCHEDULED' AND user_id IN"
            + " (SELECT id FROM users WHERE deletion_requested_at <= ?)",
        Timestamp.from(at),
        Timestamp.from(limit));
  }
}
