package com.jvtech.gefinc.admin.invitation;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.jvtech.gefinc.admin.audit.PartyView;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;

/** DTOs de convites de cadastro (módulos administrativo e público). */
public final class InvitationDtos {

  private InvitationDtos() {}

  /** Pedido de envio de convite. */
  public record InvitationRequest(
      @NotBlank(message = "Informe o endereço de e-mail.")
          @Email(message = "Endereço de e-mail inválido.")
          @Size(max = 254, message = "O e-mail pode ter no máximo 254 caracteres.")
          String email) {

    @Override
    public String toString() {
      return "InvitationRequest[REDACTED]";
    }
  }

  /** Visão do convite no painel administrativo. */
  public record InvitationView(
      long id,
      @JsonInclude(JsonInclude.Include.NON_NULL) String email,
      InvitationStatus status,
      PartyView invitedBy,
      Instant createdAt,
      Instant expiresAt) {

    @Override
    public String toString() {
      return "InvitationView[id=" + id + ", status=" + status + "]";
    }
  }

  /** Consulta pública do convite antes de aceitar. */
  public record InvitationPreview(String email, Instant expiresAt) {

    @Override
    public String toString() {
      return "InvitationPreview[REDACTED]";
    }
  }

  /** Aceite público do convite para criação de conta. */
  public record AcceptInvitationRequest(
      @NotBlank(message = "Informe a senha.")
          @Size(min = 10, max = 72, message = "A senha deve ter entre 10 e 72 caracteres.")
          String password,
      @Size(max = 80, message = "O nome pode ter no máximo 80 caracteres.") String name) {

    @Override
    public String toString() {
      return "AcceptInvitationRequest[REDACTED]";
    }
  }
}
