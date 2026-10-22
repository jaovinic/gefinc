package com.jvtech.gefinc.common.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Propriedades da aplicação ({@code app.*}); segredos vêm de variáveis de ambiente. */
@ConfigurationProperties(prefix = "app")
public record AppProperties(String timezone, String baseUrl, Security security) {

  public record Security(
      String jwtSecret,
      Duration accessTokenTtl,
      Duration refreshTokenTtl,
      List<String> corsOrigins,
      Integer bcryptStrength) {}
}
