package com.jvtech.gefinc.admin.deletion;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Livro-razão das solicitações de exclusão de conta (US10, V15). user_id, requested_by e
 * canceled_by NÃO têm FK: a linha sobrevive à exclusão da conta (D9). A justificativa em texto
 * livre NÃO fica aqui (vai apenas para audit_log.reason_text).
 */
@Entity
@Table(name = "account_deletion_requests")
public class AccountDeletionRequest {

  public static final String STATUS_SCHEDULED = "SCHEDULED";
  public static final String STATUS_CANCELED = "CANCELED";
  public static final String STATUS_SUPERSEDED = "SUPERSEDED";
  public static final String STATUS_EXECUTED = "EXECUTED";

  public static final String ORIGIN_USER = "USER";
  public static final String ORIGIN_ADMIN = "ADMIN";

  public static final String MODE_IMMEDIATE = "IMMEDIATE";
  public static final String MODE_GRACE = "GRACE";

  public static final String NOTICE_NOT_APPLICABLE = "NOT_APPLICABLE";
  public static final String NOTICE_QUEUED = "QUEUED";
  public static final String NOTICE_SENT = "SENT";
  public static final String NOTICE_PENDING = "PENDING";
  public static final String NOTICE_DISCARDED = "DISCARDED";
  public static final String NOTICE_EXPIRED = "EXPIRED";

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private long userId;

  @Column(name = "target_ref", length = 32)
  private String targetRef;

  @Column(nullable = false, length = 5)
  private String origin;

  @Column(nullable = false, length = 9)
  private String mode;

  @Column(name = "grace_days")
  private Short graceDays;

  @Column(name = "requested_at", nullable = false)
  private Instant requestedAt;

  @Column(name = "due_at", nullable = false)
  private Instant dueAt;

  @Column(name = "requested_by")
  private Long requestedBy;

  @Column(name = "reason_id")
  private Long reasonId;

  @Column(name = "reason_name", length = 80)
  private String reasonName;

  @Column(name = "reason_message", length = 500)
  private String reasonMessage;

  @Column(name = "supersedes_id")
  private Long supersedesId;

  @Column(nullable = false, length = 10)
  private String status;

  @Column(name = "notice_state", nullable = false, length = 14)
  private String noticeState;

  @Column(name = "canceled_at")
  private Instant canceledAt;

  @Column(name = "canceled_by")
  private Long canceledBy;

  @Column(name = "executed_at")
  private Instant executedAt;

  protected AccountDeletionRequest() {}

  /** Construtor para autoatendimento do usuário (30 dias, sem aviso por e-mail). */
  public static AccountDeletionRequest forUser(
      long userId, String targetRef, Instant requestedAt, Instant dueAt) {
    AccountDeletionRequest req = new AccountDeletionRequest();
    req.userId = userId;
    req.targetRef = targetRef;
    req.origin = ORIGIN_USER;
    req.mode = MODE_GRACE;
    req.graceDays = 30;
    req.requestedAt = requestedAt;
    req.dueAt = dueAt;
    req.status = STATUS_SCHEDULED;
    req.noticeState = NOTICE_NOT_APPLICABLE;
    return req;
  }

  /** Construtor para exclusão solicitada ou antecipada pelo administrador. */
  public static AccountDeletionRequest forAdmin(
      long userId,
      String targetRef,
      String mode,
      Integer graceDays,
      Instant requestedAt,
      Instant dueAt,
      long requestedBy,
      long reasonId,
      String reasonName,
      String reasonMessage,
      Long supersedesId) {
    AccountDeletionRequest req = new AccountDeletionRequest();
    req.userId = userId;
    req.targetRef = targetRef;
    req.origin = ORIGIN_ADMIN;
    req.mode = mode;
    req.graceDays = graceDays != null ? graceDays.shortValue() : null;
    req.requestedAt = requestedAt;
    req.dueAt = dueAt;
    req.requestedBy = requestedBy;
    req.reasonId = reasonId;
    req.reasonName = reasonName;
    req.reasonMessage = reasonMessage;
    req.supersedesId = supersedesId;
    req.status = STATUS_SCHEDULED;
    req.noticeState = NOTICE_QUEUED;
    return req;
  }

  public Long getId() {
    return id;
  }

  public long getUserId() {
    return userId;
  }

  public String getTargetRef() {
    return targetRef;
  }

  public String getOrigin() {
    return origin;
  }

  public String getMode() {
    return mode;
  }

  public Short getGraceDays() {
    return graceDays;
  }

  public Instant getRequestedAt() {
    return requestedAt;
  }

  public Instant getDueAt() {
    return dueAt;
  }

  public Long getRequestedBy() {
    return requestedBy;
  }

  public Long getReasonId() {
    return reasonId;
  }

  public String getReasonName() {
    return reasonName;
  }

  public String getReasonMessage() {
    return reasonMessage;
  }

  public Long getSupersedesId() {
    return supersedesId;
  }

  public String getStatus() {
    return status;
  }

  public String getNoticeState() {
    return noticeState;
  }

  public Instant getCanceledAt() {
    return canceledAt;
  }

  public Long getCanceledBy() {
    return canceledBy;
  }

  public Instant getExecutedAt() {
    return executedAt;
  }

  public boolean isScheduled() {
    return STATUS_SCHEDULED.equals(status);
  }

  public boolean isExecuted() {
    return STATUS_EXECUTED.equals(status);
  }

  public boolean isCanceled() {
    return STATUS_CANCELED.equals(status);
  }

  public boolean isSuperseded() {
    return STATUS_SUPERSEDED.equals(status);
  }

  /**
   * Transição: SCHEDULED -> CANCELED. Se já executada: 409 DELETION_ALREADY_EXECUTED. Transições a
   * partir de CANCELED ou SUPERSEDED são inválidas.
   */
  public void cancel(Instant at, Long canceledBy) {
    if (STATUS_EXECUTED.equals(this.status)) {
      throw new ApiException(
          ErrorCode.DELETION_ALREADY_EXECUTED, "A exclusão desta conta já foi executada.");
    }
    if (!STATUS_SCHEDULED.equals(this.status)) {
      throw new IllegalStateException(
          "Não é possível cancelar uma solicitação no estado " + this.status);
    }
    this.status = STATUS_CANCELED;
    this.canceledAt = at;
    this.canceledBy = canceledBy;
  }

  /** Transição: SCHEDULED -> SUPERSEDED (antecipação por admin). */
  public void supersede() {
    if (STATUS_EXECUTED.equals(this.status)) {
      throw new ApiException(
          ErrorCode.DELETION_ALREADY_EXECUTED, "A exclusão desta conta já foi executada.");
    }
    if (!STATUS_SCHEDULED.equals(this.status)) {
      throw new IllegalStateException(
          "Não é possível substituir uma solicitação no estado " + this.status);
    }
    this.status = STATUS_SUPERSEDED;
  }

  /** Transição: SUPERSEDED -> SCHEDULED (cancelamento de antecipação restaura pedido anterior). */
  public void restoreFromSuperseded() {
    if (!STATUS_SUPERSEDED.equals(this.status)) {
      throw new IllegalStateException(
          "Apenas solicitações substituídas podem ser restauradas para agendada.");
    }
    this.status = STATUS_SCHEDULED;
  }

  /** Transição: SCHEDULED -> EXECUTED (job ou exclusão imediata). */
  public void execute(Instant at) {
    if (!STATUS_SCHEDULED.equals(this.status)) {
      throw new IllegalStateException(
          "Apenas solicitações agendadas podem ser executadas. Estado atual: " + this.status);
    }
    this.status = STATUS_EXECUTED;
    this.executedAt = at;
  }

  public void updateNoticeState(String newState) {
    this.noticeState = newState;
  }

  /** Valida antecipação: o novo prazo deve ser estritamente anterior ao atual. */
  public void requireEarlierThan(Instant newDueAt) {
    if (!newDueAt.isBefore(this.dueAt)) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("days", "O novo prazo deve ser anterior ao prazo já agendado.");
    }
  }
}
