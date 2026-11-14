package com.jvtech.gefinc.common.security;

/**
 * Origem de uma requisição: IP resolvido (ver {@link ClientIpResolver}), rótulo grosseiro do
 * dispositivo e tipo de cliente ({@code WEB}, {@code MOBILE}, {@code OTHER}). IP e rótulo são dado
 * pessoal: só vão para {@code audit_log_client}, nunca para logs.
 */
public record RequestOrigin(String ip, String deviceLabel, String clientKind) {

  /** Fora de uma requisição HTTP (jobs, testes): sem IP conhecido. */
  public static final RequestOrigin NONE = new RequestOrigin(null, null, "OTHER");

  public boolean known() {
    return ip != null;
  }

  @Override
  public String toString() {
    return "RequestOrigin[ip=[redacted], clientKind=" + clientKind + "]";
  }
}
