package com.jvtech.gefinc.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jvtech.gefinc.admin.parameter.MaintenanceGuard;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.error.ProblemFactory;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Filtro de modo de manutenção: quando ativo, bloqueia usuários comuns e anônimos com {@code 503
 * MAINTENANCE} e {@code Retry-After: 300}. Administradores continuam operando normalmente e rotas
 * essenciais (CORS OPTIONS, health, status, redefinição de senha, logout, login e refresh)
 * continuam liberadas para verificação.
 */
public class MaintenanceFilter extends OncePerRequestFilter {

  private final MaintenanceGuard maintenanceGuard;
  private final ObjectMapper objectMapper;

  public MaintenanceFilter(MaintenanceGuard maintenanceGuard, ObjectMapper objectMapper) {
    this.maintenanceGuard = maintenanceGuard;
    this.objectMapper = objectMapper;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {

    if (!maintenanceGuard.isMaintenanceActive()) {
      filterChain.doFilter(request, response);
      return;
    }

    if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
      filterChain.doFilter(request, response);
      return;
    }

    String path = extractPath(request);

    if (isExemptPath(path)) {
      filterChain.doFilter(request, response);
      return;
    }

    if (isAdminAuthenticated()) {
      filterChain.doFilter(request, response);
      return;
    }

    // Barrado pelo modo de manutenção
    response.setStatus(ErrorCode.MAINTENANCE.status().value());
    response.setHeader("Retry-After", "300");
    response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);

    String message = maintenanceGuard.getMaintenanceMessage();
    String detail =
        message != null && !message.isBlank()
            ? message
            : "Sistema em manutenção. Tente novamente mais tarde.";

    var problem =
        ProblemFactory.create(
            ErrorCode.MAINTENANCE,
            detail,
            Map.of("message", message != null ? message : ""),
            List.of());

    objectMapper.writeValue(response.getOutputStream(), problem);
  }

  private static String extractPath(HttpServletRequest request) {
    String uri = request.getRequestURI();
    if (uri == null || uri.isEmpty()) {
      return "";
    }
    String context = request.getContextPath();
    String path =
        context != null && !context.isEmpty() && uri.startsWith(context)
            ? uri.substring(context.length())
            : uri;
    int params = path.indexOf(';');
    return params >= 0 ? path.substring(0, params) : path;
  }

  private boolean isExemptPath(String path) {
    return path.equals("/system/status")
        || path.equals("/actuator/health")
        || path.startsWith("/actuator/health/")
        || path.startsWith("/auth/password-reset/")
        || path.equals("/auth/logout")
        || path.equals("/auth/login")
        || path.equals("/auth/refresh");
  }

  private boolean isAdminAuthenticated() {
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth == null || !auth.isAuthenticated()) {
      return false;
    }
    for (GrantedAuthority authority : auth.getAuthorities()) {
      String role = authority.getAuthority();
      if ("ROLE_ADMIN".equals(role) || "ROLE_ROOT".equals(role)) {
        return true;
      }
    }
    return false;
  }
}
