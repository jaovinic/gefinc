package com.jvtech.gefinc.common.mail;

/**
 * Pedido de envio do e-mail de redefinição de senha, tratado só depois do commit. O destinatário e
 * o link (que contém o token) nunca aparecem em {@code toString}.
 */
public record PasswordResetMailRequested(String to, String link) {

  @Override
  public String toString() {
    return "PasswordResetMailRequested[to=[email], link=[redacted]]";
  }
}
