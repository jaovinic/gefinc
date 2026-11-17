package com.jvtech.gefinc.common.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Propriedades da aplicação ({@code app.*}); segredos vêm de variáveis de ambiente e nunca saem em
 * {@code toString}.
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
    String timezone,
    String baseUrl,
    String mailFrom,
    String pseudonymSecret,
    Security security,
    Admin admin) {

  /**
   * @param trustedProxies CIDRs dos proxies que podem informar o IP real; vazio = nunca confia.
   * @param clientIpHeader cabeçalho com o IP real, lido apenas quando a conexão vem de um proxy
   *     confiável.
   */
  public record Security(
      String jwtSecret,
      Duration accessTokenTtl,
      Duration refreshTokenTtl,
      List<String> corsOrigins,
      Integer bcryptStrength,
      List<String> trustedProxies,
      @DefaultValue("CF-Connecting-IP") String clientIpHeader) {

    @Override
    public String toString() {
      return "Security[REDACTED]";
    }
  }

  /** Parâmetros do painel administrativo (ver {@code specs/005-admin-panel}). */
  public record Admin(
      @DefaultValue("25") int pageSize,
      @DefaultValue("100") int maxPageSize,
      @DefaultValue("100") int searchMaxLength,
      @DefaultValue("60s") Duration statsCacheTtl,
      @DefaultValue("7d") Duration invitationTtl,
      @DefaultValue("5") int reauthMaxFailures,
      @DefaultValue Rate rate) {

    public record Rate(
        @DefaultValue("30") int mutatingPerMinute,
        @DefaultValue("10") int destructivePerWindow,
        @DefaultValue("15m") Duration destructiveWindow,
        @DefaultValue("15m") Duration reauthWindow) {}
  }

  @Override
  public String toString() {
    return "AppProperties[REDACTED]";
  }
}
