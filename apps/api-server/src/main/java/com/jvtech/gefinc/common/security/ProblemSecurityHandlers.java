package com.jvtech.gefinc.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.error.ProblemFactory;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;

/** Respostas {@code problem+json} para falhas de autenticação (401) e autorização (403). */
public class ProblemSecurityHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {

  private final ObjectMapper objectMapper;

  public ProblemSecurityHandlers(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  @Override
  public void commence(
      HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
      throws IOException {
    write(response, ErrorCode.UNAUTHORIZED, "Autenticação necessária ou expirada.");
  }

  @Override
  public void handle(
      HttpServletRequest request, HttpServletResponse response, AccessDeniedException exception)
      throws IOException {
    write(response, ErrorCode.FORBIDDEN, "Acesso negado.");
  }

  private void write(HttpServletResponse response, ErrorCode code, String detail)
      throws IOException {
    response.setStatus(code.status().value());
    response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
    objectMapper.writeValue(response.getOutputStream(), ProblemFactory.create(code, detail));
  }
}
