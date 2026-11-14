package com.jvtech.gefinc.admin.common;

import com.jvtech.gefinc.admin.audit.ActorKind;
import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.audit.AuditEntry;
import com.jvtech.gefinc.admin.audit.AuditService;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.error.TooManyRequestsException;
import com.jvtech.gefinc.common.ratelimit.PerKeyRateLimiter;
import com.jvtech.gefinc.common.security.AuthenticatedUser;
import com.jvtech.gefinc.common.security.RequestOriginProvider;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

/**
 * Limita as escritas do painel por administrador (30 por minuto) e as ações {@link Destructive} (10
 * por 15 minutos, além da cota comum). Leituras não contam. Verifica as duas cotas antes de
 * registrar em qualquer uma, então uma recusa não consome cota nem estende a janela. A recusa é
 * auditada uma vez por janela ({@code ACCESS_DENIED}, deduplicada por administrador, IP e rota). É
 * um interceptador de MVC: roda depois da cadeia de segurança e só enxerga requisições já
 * autorizadas.
 */
public class AdminRateLimitInterceptor implements HandlerInterceptor {

  private static final Logger log = LoggerFactory.getLogger(AdminRateLimitInterceptor.class);
  private static final Set<String> READ_ONLY = Set.of("GET", "HEAD", "OPTIONS");
  private static final int SUBJECT_MAX = 60;

  private final PerKeyRateLimiter mutating;
  private final PerKeyRateLimiter destructive;
  private final AuditService audit;
  private final RequestOriginProvider origins;

  public AdminRateLimitInterceptor(
      PerKeyRateLimiter mutating,
      PerKeyRateLimiter destructive,
      AuditService audit,
      RequestOriginProvider origins) {
    this.mutating = mutating;
    this.destructive = destructive;
    this.audit = audit;
    this.origins = origins;
  }

  @Override
  public boolean preHandle(
      HttpServletRequest request, HttpServletResponse response, Object handler) {
    if (!(handler instanceof HandlerMethod method) || READ_ONLY.contains(request.getMethod())) {
      return true;
    }
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null
        || !(authentication.getPrincipal() instanceof AuthenticatedUser user)) {
      return true;
    }
    String key = Long.toString(user.id());
    boolean isDestructive = method.hasMethodAnnotation(Destructive.class);
    long wait = mutating.secondsUntilFree(key);
    if (isDestructive) {
      wait = Math.max(wait, destructive.secondsUntilFree(key));
    }
    if (wait > 0) {
      auditDenied(request, user.id());
      throw new TooManyRequestsException(
          "Muitas ações administrativas em pouco tempo. Aguarde e tente novamente.", wait);
    }
    mutating.record(key);
    if (isDestructive) {
      destructive.record(key);
    }
    return true;
  }

  private void auditDenied(HttpServletRequest request, long adminId) {
    try {
      Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
      String route = pattern == null ? request.getRequestURI() : pattern.toString();
      if (route.length() > SUBJECT_MAX) {
        route = route.substring(0, SUBJECT_MAX);
      }
      AuditEntry entry =
          AuditEntry.builder(AuditAction.ACCESS_DENIED)
              .actor(ActorKind.ADMIN, adminId)
              .subject(route)
              .refusal(ErrorCode.TOO_MANY_REQUESTS.name())
              .build();
      audit.recordAttempt(entry, origins.current(), route);
    } catch (RuntimeException e) {
      // Só a classe; a requisição segue recusada com 429 mesmo sem o registro.
      log.error("Falha ao registrar a recusa por limite de taxa: {}", e.getClass().getSimpleName());
    }
  }
}
