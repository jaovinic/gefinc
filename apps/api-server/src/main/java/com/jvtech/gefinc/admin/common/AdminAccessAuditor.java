package com.jvtech.gefinc.admin.common;

import com.jvtech.gefinc.admin.audit.ActorKind;
import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.audit.AuditEntry;
import com.jvtech.gefinc.admin.audit.AuditService;
import com.jvtech.gefinc.common.security.AuthenticatedUser;
import com.jvtech.gefinc.common.security.RequestOrigin;
import com.jvtech.gefinc.common.security.RequestOriginProvider;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Registra o acesso negado a {@code /admin/**}: usuário comum (403) e visitante (401). A tentativa
 * entra na trilha como {@code ACCESS_DENIED}, deduplicada em 15 minutos por ator, IP e rota
 * normalizada, e todo acesso negado incrementa o contador {@code gefinc.admin.access.denied}. A
 * rota é normalizada ({@code {id}} no lugar de identificadores) para não gravar dado pessoal. Falha
 * ao gravar nunca vira 500: a resposta 401/403 segue, com log só da classe do erro.
 *
 * <p>O visitante só é auditado quando a requisição não traz {@code Authorization}: um token
 * recusado ou expirado apenas incrementa o contador, para uma sessão que expirou no navegador não
 * encher a trilha.
 */
@Component
public class AdminAccessAuditor {

  static final String DENIED = "gefinc.admin.access.denied";
  private static final String ADMIN_PREFIX = "/admin";
  private static final int SUBJECT_MAX = 60;
  private static final Pattern NUMERIC = Pattern.compile("\\d+");
  private static final Pattern SAFE_SEGMENT = Pattern.compile("[A-Za-z0-9_.-]{1,40}");
  private static final Logger log = LoggerFactory.getLogger(AdminAccessAuditor.class);

  private final AuditService audit;
  private final RequestOriginProvider origins;
  private final MeterRegistry registry;

  public AdminAccessAuditor(
      AuditService audit, RequestOriginProvider origins, MeterRegistry registry) {
    this.audit = audit;
    this.origins = origins;
    this.registry = registry;
  }

  /** O caminho da requisição (sem o contexto da aplicação) é de {@code /admin}? */
  public static boolean isAdminPath(HttpServletRequest request) {
    String path = path(request);
    return path.equals(ADMIN_PREFIX) || path.startsWith(ADMIN_PREFIX + "/");
  }

  /** Chamado quando um acesso a {@code /admin/**} é negado; nunca lança. */
  public void denied(HttpServletRequest request) {
    try {
      registry.counter(DENIED).increment();
      AuthenticatedUser user = authenticatedUser();
      if (user == null && request.getHeader(HttpHeaders.AUTHORIZATION) != null) {
        return;
      }
      String route = normalize(path(request));
      RequestOrigin origin = origins.from(request);
      AuditEntry.Builder entry =
          AuditEntry.builder(AuditAction.ACCESS_DENIED).subject(route).refusal(refusalCode(user));
      if (user == null) {
        entry.actor(ActorKind.VISITOR, null);
      } else {
        entry.actor(ActorKind.USER, user.id());
      }
      audit.recordAttempt(entry.build(), origin, route);
    } catch (RuntimeException failure) {
      // Só a classe: a mensagem poderia trazer dado pessoal. A resposta 401/403 segue normalmente.
      log.error(
          "Falha ao registrar o acesso negado ao painel: {}", failure.getClass().getSimpleName());
    }
  }

  private static String refusalCode(AuthenticatedUser user) {
    return user == null ? "UNAUTHORIZED" : "FORBIDDEN";
  }

  private static AuthenticatedUser authenticatedUser() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
      return user;
    }
    return null;
  }

  private static String path(HttpServletRequest request) {
    String uri = request.getRequestURI();
    String context = request.getContextPath();
    String path =
        context != null && !context.isEmpty() && uri.startsWith(context)
            ? uri.substring(context.length())
            : uri;
    int params = path.indexOf(';');
    return params >= 0 ? path.substring(0, params) : path;
  }

  /**
   * Rota sem dado variável: segmentos numéricos ou UUID viram {@code {id}}; qualquer outro segmento
   * fora de letras, números e {@code _.-} vira {@code {?}}; no máximo 60 caracteres.
   */
  static String normalize(String path) {
    StringBuilder route = new StringBuilder();
    for (String segment : path.split("/")) {
      if (segment.isEmpty()) {
        continue;
      }
      route.append('/').append(normalizeSegment(segment));
    }
    String result = route.length() == 0 ? "/" : route.toString();
    return result.length() > SUBJECT_MAX ? result.substring(0, SUBJECT_MAX) : result;
  }

  private static String normalizeSegment(String segment) {
    if (NUMERIC.matcher(segment).matches() || isUuid(segment)) {
      return "{id}";
    }
    return SAFE_SEGMENT.matcher(segment).matches() ? segment : "{?}";
  }

  private static boolean isUuid(String segment) {
    if (segment.length() != 36) {
      return false;
    }
    try {
      UUID.fromString(segment);
      return true;
    } catch (IllegalArgumentException e) {
      return false;
    }
  }
}
