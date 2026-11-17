package com.jvtech.gefinc.admin.common;

import com.jvtech.gefinc.admin.audit.AuditService;
import com.jvtech.gefinc.common.ratelimit.PerKeyRateLimiter;
import com.jvtech.gefinc.common.security.RequestOriginProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Registra o limite de taxa nas rotas {@code /admin/**}. */
@Configuration
public class AdminWebConfig implements WebMvcConfigurer {

  private final AdminRateLimitInterceptor rateLimit;

  public AdminWebConfig(
      @Qualifier("adminMutatingLimiter") PerKeyRateLimiter mutating,
      @Qualifier("adminDestructiveLimiter") PerKeyRateLimiter destructive,
      AuditService audit,
      RequestOriginProvider origins) {
    this.rateLimit = new AdminRateLimitInterceptor(mutating, destructive, audit, origins);
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(rateLimit).addPathPatterns("/admin/**");
  }
}
