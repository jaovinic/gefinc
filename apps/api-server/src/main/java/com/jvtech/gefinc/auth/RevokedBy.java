package com.jvtech.gefinc.auth;

/** Quem encerrou a sessão (coluna {@code auth_sessions.revoked_by}). */
public enum RevokedBy {
  /** O próprio usuário: logout, troca de senha, redefinição ou pedido de exclusão da conta. */
  USER,
  /** Um administrador pelo painel. */
  ADMIN,
  /**
   * O sistema: reuso de token de renovação, conta suspensa ou excluída, falhas de reautenticação.
   */
  SYSTEM
}
