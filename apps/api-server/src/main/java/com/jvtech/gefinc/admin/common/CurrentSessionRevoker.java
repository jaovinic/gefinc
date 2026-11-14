package com.jvtech.gefinc.admin.common;

/**
 * Revoga a sessão atual do administrador depois de falhas repetidas de reautenticação. A
 * implementação provisória é {@link TokenVersionSessionRevoker}; a revogação por identificador de
 * sessão ({@code sid}) a substitui quando as sessões forem gravadas no login.
 */
public interface CurrentSessionRevoker {

  void revokeCurrent(long adminId);
}
