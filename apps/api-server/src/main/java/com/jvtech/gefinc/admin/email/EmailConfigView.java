package com.jvtech.gefinc.admin.email;

/** Configuração de envio exibida ao administrador: nunca inclui usuário nem senha do SMTP. */
public record EmailConfigView(
    String host, int port, String from, boolean complete, boolean authEnabled, boolean starttls) {}
