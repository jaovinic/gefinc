package com.jvtech.gefinc.common.mail;

/**
 * Pedido de envio do e-mail de redefinição de senha, tratado só depois do commit. {@code userId} é
 * o usuário dono da conta (pode ser nulo) e vai para o histórico de envios. O destinatário e o link
 * (que contém o token) nunca aparecem em {@code toString}.
 */
public record PasswordResetMailRequested(String to, String link, Long userId) {

  public PasswordResetMailRequested(String to, String link) {
    this(to, link, null);
  }

  @Override
  public String toString() {
    return "PasswordResetMailRequested[to=[email], link=[redacted]]";
  }
}
