package com.jvtech.gefinc.admin.user;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** Corpos das operações de perfil e política sobre usuários (módulo administrativo). */
public final class UserPolicyDtos {

  private UserPolicyDtos() {}

  /**
   * Pedido de troca de perfil. {@code role} só aceita {@code USER} ou {@code ADMIN} (o raiz não se
   * concede pelo painel). A senha é a do próprio administrador; ausente ou errada dá {@code
   * REAUTH_FAILED}, não erro de validação.
   */
  public record RoleChangeRequest(
      @NotNull(message = "Informe o perfil.")
          @Pattern(regexp = "USER|ADMIN", message = "Perfil inválido.")
          String role,
      String password) {

    /** Sem senha em logs. */
    @Override
    public String toString() {
      return "RoleChangeRequest[REDACTED]";
    }
  }
}
