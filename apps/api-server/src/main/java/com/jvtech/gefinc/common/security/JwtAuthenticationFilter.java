package com.jvtech.gefinc.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Autentica pelo cabeçalho {@code Authorization: Bearer}. Recusa o token se a versão gravada nele
 * diferir da do usuário ou se houver exclusão de conta pendente. O papel nunca vem do token: é lido
 * do banco a cada requisição e vira as autoridades {@code ROLE_ADMIN} (administrador e raiz) e
 * {@code ROLE_ROOT} (só o raiz), o que faz a troca de papel valer na requisição seguinte.
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
                new AuthenticatedUser(claims.userId(), state.get().role(), null),
                null,
                authorities(state.get().role()));
        SecurityContextHolder.getContext().setAuthentication(authentication);
      }
    } catch (InvalidTokenException ignored) {
      // Sem autenticação: as rotas protegidas respondem 401 pelo ponto de entrada.
    }
  }

  private static List<GrantedAuthority> authorities(String role) {
    List<GrantedAuthority> authorities = new ArrayList<>(2);
    if ("ADMIN".equals(role) || "ROOT".equals(role)) {
      authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }
    if ("ROOT".equals(role)) {
      authorities.add(new SimpleGrantedAuthority("ROLE_ROOT"));
    }
    return authorities;
  }
}
