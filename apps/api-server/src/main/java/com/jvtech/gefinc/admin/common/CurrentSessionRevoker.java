package com.jvtech.gefinc.admin.common;

/**
 * Revoga a sessão atual do administrador depois de falhas repetidas de reautenticação. A
 * implementação é {@link SidSessionRevoker}, que age pelo identificador de sessão ({@code sid}).
 */
public interface CurrentSessionRevoker {

  void revokeCurrent(long adminId);
}
