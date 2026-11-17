package com.jvtech.gefinc.admin.deletion;

import java.time.Instant;

/** DTOs de exclusão de usuário, motivos e comunicações pendentes (contrato OpenAPI). */
public final class DeletionDtos {

  private DeletionDtos() {}

  public record DeletionRequest(
      Long reasonId,
      String justification,
      String mode,
      Integer days,
      String confirmEmail,
      String password) {
    @Override
    public String toString() {
      return "DeletionRequest[REDACTED]";
    }
  }

  public record DeletionOutcome(String status, Instant dueAt, String noticeState) {}

  public record DeletionReasonView(
      Long id, String name, String message, boolean active, boolean initial) {}

  public record DeletionReasonInput(String name, String message) {}

  public record PendingCommunicationView(
      Long id,
      String kind,
      String targetLabel,
      String failureReason,
      int attempts,
      Instant createdAt,
      Instant retainedUntil) {}

  public record ResendResult(String state) {}

  public record AdminAlerts(long pendingCommunications) {}
}
