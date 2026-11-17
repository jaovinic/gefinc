package com.jvtech.gefinc.common.security;

/**
 * Estado do usuário relevante para validar um token de acesso já emitido. O papel vai como texto
 * ({@code USER}, {@code ADMIN} ou {@code ROOT}) para a segurança não depender do módulo {@code
 * user}.
 */
public record TokenState(
    int tokenVersion,
    boolean deletionPending,
    boolean suspended,
    String role,
    SessionState sessionState) {

  /** Situação da sessão do token; {@code UNTRACKED}: token sem sessão registrada. */
  public enum SessionState {
    UNTRACKED,
    OPEN,
    REVOKED,
    EXPIRED
  }
}
