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
 * diferir da do usuário, se a conta estiver suspensa ou com exclusão pendente e, quando o token
 * traz a claim {@code sid}, se a sessão estiver encerrada, expirada ou não existir; o token sem
 * {@code sid} (emitido antes da sessão existir) vale até expirar. Tudo sai de uma só consulta por
 * chave primária, sem escrita. O papel nunca vem do token: é lido do banco a cada requisição e vira
 * as autoridades {@code ROLE_ADMIN} (administrador e raiz) e {@code ROLE_ROOT} (só o raiz), o que
 * faz a troca de papel valer na requisição seguinte.
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
      Optional<TokenState> state = tokenVersionLookup.find(claims.userId(), claims.sessionId());
      if (state.isPresent() && accepts(state.get(), claims)) {
        var authentication =
            new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(claims.userId(), state.get().role(), claims.sessionId()),
                null,
                authorities(state.get().role()));
        SecurityContextHolder.getContext().setAuthentication(authentication);
      }
    } catch (InvalidTokenException ignored) {
      // Sem autenticação: as rotas protegidas respondem 401 pelo ponto de entrada.
    }
  }

  private static boolean accepts(TokenState state, AccessTokenClaims claims) {
    if (state.deletionPending()
        || state.suspended()
        || state.tokenVersion() != claims.tokenVersion()) {
      return false;
    }
    // Token legado (sem sid) vale até expirar; com sid exige a sessão aberta.
    return claims.sessionId() == null || state.sessionState() == TokenState.SessionState.OPEN;
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
