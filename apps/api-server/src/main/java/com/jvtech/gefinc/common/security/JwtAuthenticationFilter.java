package com.jvtech.gefinc.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Autentica pelo cabeçalho {@code Authorization: Bearer}. Recusa o token se a versão gravada nele
 * diferir da do usuário ou se houver exclusão de conta pendente.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

  private static final String PREFIX = "Bearer ";

  private final JwtService jwtService;
  private final TokenVersionLookup tokenVersionLookup;

  public JwtAuthenticationFilter(JwtService jwtService, TokenVersionLookup tokenVersionLookup) {
    this.jwtService = jwtService;
    this.tokenVersionLookup = tokenVersionLookup;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String header = request.getHeader(HttpHeaders.AUTHORIZATION);
    if (header != null && header.startsWith(PREFIX)) {
      authenticate(header.substring(PREFIX.length()));
    }
    chain.doFilter(request, response);
  }

  private void authenticate(String token) {
    try {
      AccessTokenClaims claims = jwtService.parse(token);
      Optional<TokenState> state = tokenVersionLookup.find(claims.userId());
      if (state.isPresent()
          && !state.get().deletionPending()
          && state.get().tokenVersion() == claims.tokenVersion()) {
        var authentication =
            new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(claims.userId()), null, List.of());
        SecurityContextHolder.getContext().setAuthentication(authentication);
      }
    } catch (InvalidTokenException ignored) {
      // Sem autenticação: as rotas protegidas respondem 401 pelo ponto de entrada.
    }
  }
}
