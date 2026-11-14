package com.jvtech.gefinc.admin.user;

/** Corpos das operações de perfil e política sobre usuários (módulo administrativo). */
public final class UserPolicyDtos {

  private UserPolicyDtos() {}

  /**
   * Pedido de troca de perfil. {@code role} só vale {@code USER} ou {@code ADMIN} (o raiz não se
   * concede pelo painel); o valor é validado dentro da ação auditada ({@code AdminRoleService}),
   * não por Bean Validation, para que a recusa 422 também entre na trilha. A senha é a do próprio
   * administrador; ausente ou errada dá {@code REAUTH_FAILED}, não erro de validação.
   */
  public record RoleChangeRequest(String role, String password) {

    /** Sem senha em logs. */
    @Override
    public String toString() {
      return "RoleChangeRequest[REDACTED]";
    }
  }
}
