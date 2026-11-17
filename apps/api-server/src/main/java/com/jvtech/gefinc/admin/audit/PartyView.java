package com.jvtech.gefinc.admin.audit;

/**
 * Quem agiu ou sofreu a ação, como o painel mostra: o nome ou o e-mail vivos da conta, {@code
 * anônimo-} e 8 hexadecimais se ela já não existe, {@code visitante} para quem não estava
 * autenticado e {@code sistema} para ações automáticas. Nunca carrega IP.
 */
public record PartyView(Long userId, String label) {

  /** Sem rótulo (nome ou e-mail) em logs. */
  @Override
  public String toString() {
    return "PartyView[REDACTED]";
  }
}
