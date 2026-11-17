package com.jvtech.gefinc.admin.parameter;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.jvtech.gefinc.admin.audit.PartyView;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public final class ParameterDtos {

  private ParameterDtos() {}

  public record SystemStatusResponse(
      boolean maintenance,
      @JsonInclude(JsonInclude.Include.NON_NULL) String message,
      boolean signupsOpen) {}

  public record ParametersView(
      List<EditableParameterView> editable, List<ReadOnlyParameterView> readOnly) {}

  public record EditableParameterView(
      String key,
      String value,
      Instant updatedAt,
      @JsonInclude(JsonInclude.Include.NON_NULL) PartyView updatedBy,
      @JsonProperty("editable") boolean editable) {

    public EditableParameterView(String key, String value, Instant updatedAt, PartyView updatedBy) {
      this(key, value, updatedAt, updatedBy, true);
    }
  }

  public record ReadOnlyParameterView(
      String key, String value, String label, @JsonProperty("editable") boolean editable) {

    public ReadOnlyParameterView(String key, String value, String label) {
      this(key, value, label, false);
    }
  }

  public record SignupsOpenRequest(
      @NotNull(message = "Informe se os cadastros estão abertos.") Boolean open) {}

  public record MaintenanceRequest(
      @NotNull(message = "Informe se o modo de manutenção está ativado.") Boolean enabled,
      @Size(max = 280, message = "A mensagem de manutenção deve ter no máximo 280 caracteres.")
          String message) {}

  public record RevokeAllRequest(String password, String confirmWord) {
    @Override
    public String toString() {
      return "RevokeAllRequest[REDACTED]";
    }
  }

  public record RevokeAllResult(int revoked) {}
}
