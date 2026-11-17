package com.jvtech.gefinc.admin.common;

import com.jvtech.gefinc.common.config.AppProperties;
import com.jvtech.gefinc.common.ratelimit.PerKeyRateLimiter;
import java.time.Clock;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Limitadores em memória do painel, por administrador (instância única da API). */
@Configuration
public class AdminRateLimitConfig {

  /** Escritas (POST, PUT, PATCH, DELETE) por minuto. */
  @Bean
  PerKeyRateLimiter adminMutatingLimiter(Clock clock, AppProperties properties) {
    return new PerKeyRateLimiter(
        clock, properties.admin().rate().mutatingPerMinute(), Duration.ofMinutes(1));
  }

  /** Ações marcadas com {@link Destructive}, por janela. */
  @Bean
  PerKeyRateLimiter adminDestructiveLimiter(Clock clock, AppProperties properties) {
    AppProperties.Admin.Rate rate = properties.admin().rate();
    return new PerKeyRateLimiter(clock, rate.destructivePerWindow(), rate.destructiveWindow());
  }

  /** Falhas consecutivas de reautenticação por senha. */
  @Bean
  PerKeyRateLimiter adminReauthFailureLimiter(Clock clock, AppProperties properties) {
    return new PerKeyRateLimiter(
        clock, properties.admin().reauthMaxFailures(), properties.admin().rate().reauthWindow());
  }

  /** Envios administrativos de e-mail por usuário-alvo (3 por hora). */
  @Bean
  PerKeyRateLimiter adminTargetMailLimiter(Clock clock) {
    return new PerKeyRateLimiter(clock, 3, Duration.ofHours(1));
  }
}
