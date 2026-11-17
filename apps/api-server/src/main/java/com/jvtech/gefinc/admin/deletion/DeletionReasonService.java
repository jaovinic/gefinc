package com.jvtech.gefinc.admin.deletion;

import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.DeletionReasonInput;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.DeletionReasonView;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import java.time.Clock;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gestão de motivos de exclusão de conta (US11). Não há remoção física de motivos (sem DELETE,
 * D29). Desativação garante ao menos um motivo ativo com trava consultiva.
 */
@Service
public class DeletionReasonService {

  private static final String LOCK_NAME = "gefinc.deletion-reasons";

  private final DeletionReasonRepository reasons;
  private final GenericMessageValidator messageValidator;
  private final AdminActionExecutor executor;
  private final JdbcTemplate jdbc;
  private final Clock clock;

  public DeletionReasonService(
      DeletionReasonRepository reasons,
      GenericMessageValidator messageValidator,
      AdminActionExecutor executor,
      JdbcTemplate jdbc,
      Clock clock) {
    this.reasons = reasons;
    this.messageValidator = messageValidator;
    this.executor = executor;
    this.jdbc = jdbc;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public List<DeletionReasonView> listAll() {
    return reasons.findAllByOrderByIdAsc().stream().map(this::toView).toList();
  }

  public DeletionReasonView create(DeletionReasonInput input) {
    validateName(input.name());
    messageValidator.validate(input.message());

    return executor.run(
        new AuditContext(AuditAction.REASON_CREATED, null, null, null, null),
        () -> {
          if (reasons.existsByNameIgnoreCaseExcluding(input.name().strip(), null)) {
            throw new ApiException(
                ErrorCode.REASON_NAME_TAKEN, "Já existe um motivo cadastrado com este nome.");
          }
          DeletionReason created =
              reasons.save(
                  new DeletionReason(input.name(), input.message(), false, clock.instant()));
          return toView(created);
        });
  }

  public DeletionReasonView update(long id, DeletionReasonInput input) {
    validateName(input.name());
    messageValidator.validate(input.message());

    return executor.run(
        new AuditContext(AuditAction.REASON_UPDATED, null, Long.toString(id), null, null),
        () -> {
          DeletionReason reason = load(id);
          if (reasons.existsByNameIgnoreCaseExcluding(input.name().strip(), id)) {
            throw new ApiException(
                ErrorCode.REASON_NAME_TAKEN, "Já existe um motivo cadastrado com este nome.");
          }
          reason.update(input.name(), input.message(), clock.instant());
          return toView(reason);
        });
  }

  public void deactivate(long id) {
    executor.run(
        new AuditContext(AuditAction.REASON_DEACTIVATED, null, Long.toString(id), null, null),
        () -> {
          lockReasons();
          DeletionReason reason = load(id);
          if (!reason.isActive()) {
            return null;
          }
          if (reasons.countActive() <= 1) {
            throw new ApiException(
                ErrorCode.LAST_ACTIVE_REASON,
                "Não é permitido desativar o último motivo de exclusão ativo.");
          }
          reason.deactivate(clock.instant());
          return null;
        });
  }

  public void activate(long id) {
    executor.run(
        new AuditContext(AuditAction.REASON_ACTIVATED, null, Long.toString(id), null, null),
        () -> {
          DeletionReason reason = load(id);
          if (reason.isActive()) {
            return null;
          }
          reason.activate(clock.instant());
          return null;
        });
  }

  private void lockReasons() {
    jdbc.query(
        "SELECT pg_advisory_xact_lock(hashtext(?))", ps -> ps.setString(1, LOCK_NAME), rs -> {});
  }

  private DeletionReason load(long id) {
    return reasons
        .findById(id)
        .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Motivo não encontrado."));
  }

  private void validateName(String name) {
    if (name == null || name.isBlank()) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("name", "Informe o nome do motivo de exclusão.");
    }
    String stripped = name.strip();
    if (stripped.length() > DeletionReason.NAME_MAX) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError(
              "name",
              "O nome do motivo deve ter no máximo " + DeletionReason.NAME_MAX + " caracteres.");
    }
  }

  private DeletionReasonView toView(DeletionReason r) {
    return new DeletionReasonView(
        r.getId(), r.getName(), r.getMessage(), r.isActive(), r.isInitial());
  }
}
