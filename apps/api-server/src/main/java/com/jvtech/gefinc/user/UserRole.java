package com.jvtech.gefinc.user;

/** Papel do usuário. O JWT não o carrega: é lido do banco a cada requisição autenticada. */
public enum UserRole {
  USER,
  ADMIN,
  ROOT;

  /** Administrador comum ou raiz: quem passa pela barreira de {@code /admin/**}. */
  public boolean isAdmin() {
    return this != USER;
  }
}
