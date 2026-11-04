package com.jvtech.gefinc.idempotency;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.error.ProblemFactory;
import com.jvtech.gefinc.common.security.AuthenticatedUser;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

/**
 * Idempotência das operações que o app executa offline: criar lançamento, pagar, desfazer o
 * pagamento, editar lançamento ({@code PATCH}) ou grupo ({@code PUT}), excluir grupo ({@code
 * DELETE}), alterar o valor e encerrar um lançamento fixo. Só age quando o cabeçalho {@code
 * Idempotency-Key} vem em uma requisição autenticada de um desses verbos e caminhos (a query
 * string, como o {@code ?confirm=true} da exclusão, não faz parte do caminho); todo o resto passa
 * direto. Fica depois da autenticação na cadeia de segurança, e a chave vale por usuário (Princípio
 * III).
 */
public class IdempotencyFilter extends OncePerRequestFilter {

  static final String KEY_HEADER = "Idempotency-Key";
  static final String REPLAYED_HEADER = "Idempotent-Replayed";

  private static final Map<String, Pattern> SUPPORTED =
      Map.of(
          "POST",
          Pattern.compile(
              "^/(transaction-groups|transactions/\\d+/(pay|unpay)"
                  + "|transaction-groups/\\d+/(amount-changes|end))$"),
          "PATCH",
          Pattern.compile("^/transactions/\\d+$"),
          "PUT",
          Pattern.compile("^/transaction-groups/\\d+$"),
          "DELETE",
          Pattern.compile("^/transaction-groups/\\d+$"));

  private final IdempotencyService service;
  private final ObjectMapper mapper;

  public IdempotencyFilter(IdempotencyService service, ObjectMapper mapper) {
    this.service = service;
    this.mapper = mapper;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String path = request.getRequestURI().substring(request.getContextPath().length());
    String header = request.getHeader(KEY_HEADER);
    Long userId = authenticatedUserId();
    if (header == null || userId == null || !supports(request.getMethod(), path)) {
      chain.doFilter(request, response);
      return;
    }
    UUID key = parse(header);
    if (key == null) {
      problem(response, ErrorCode.BAD_REQUEST, "O cabeçalho Idempotency-Key deve ser um UUID.");
      return;
    }

    byte[] body = request.getInputStream().readAllBytes();
    IdempotencyService.Outcome outcome =
        service.begin(userId, key, request.getMethod(), path, IdempotencyService.hash(body));
    switch (outcome) {
      case IdempotencyService.Replay replay -> replay(response, replay);
      case IdempotencyService.InProgress ignored ->
          problem(
              response,
              ErrorCode.IDEMPOTENCY_IN_PROGRESS,
              "Esta operação ainda está sendo processada. Tente novamente em instantes.");
      case IdempotencyService.KeyReused ignored ->
          problem(
              response,
              ErrorCode.IDEMPOTENCY_KEY_REUSED,
              "Esta chave de idempotência já foi usada em outra operação.");
      case IdempotencyService.Started ignored ->
          execute(new CachedBodyRequest(request, body), response, chain, userId, key);
    }
  }

  private void execute(
      HttpServletRequest request,
      HttpServletResponse response,
      FilterChain chain,
      long userId,
      UUID key)
      throws ServletException, IOException {
    ContentCachingResponseWrapper wrapper = new ContentCachingResponseWrapper(response);
    try {
      chain.doFilter(request, wrapper);
    } catch (ServletException | IOException | RuntimeException e) {
      service.release(userId, key);
      throw e;
    }
    if (wrapper.getStatus() >= 500) {
      // Falha inesperada: libera a chave para o cliente poder tentar de novo.
      service.release(userId, key);
    } else {
      service.complete(
          userId,
          key,
          wrapper.getStatus(),
          new String(wrapper.getContentAsByteArray(), StandardCharsets.UTF_8));
    }
    wrapper.copyBodyToResponse();
  }

  private void replay(HttpServletResponse response, IdempotencyService.Replay replay)
      throws IOException {
    response.setStatus(replay.status());
    response.setHeader(REPLAYED_HEADER, "true");
    // Respostas sem corpo (204 da exclusão) voltam sem corpo e sem tipo de conteúdo.
    if (replay.body() != null && !replay.body().isEmpty()) {
      response.setContentType(
          replay.status() >= 400
              ? MediaType.APPLICATION_PROBLEM_JSON_VALUE
              : MediaType.APPLICATION_JSON_VALUE);
      response.setCharacterEncoding(StandardCharsets.UTF_8.name());
      response.getOutputStream().write(replay.body().getBytes(StandardCharsets.UTF_8));
    }
  }

  private void problem(HttpServletResponse response, ErrorCode code, String detail)
      throws IOException {
    response.setStatus(code.status().value());
    response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
    mapper.writeValue(response.getOutputStream(), ProblemFactory.create(code, detail));
  }

  private static boolean supports(String method, String path) {
    Pattern pattern = SUPPORTED.get(method);
    return pattern != null && pattern.matcher(path).matches();
  }

  private static UUID parse(String value) {
    try {
      return UUID.fromString(value.trim());
    } catch (IllegalArgumentException e) {
      return null;
    }
  }

  private static Long authenticatedUserId() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    return authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user
        ? user.id()
        : null;
  }

  /** Repassa ao controlador o corpo já lido para calcular o hash. */
  private static final class CachedBodyRequest extends HttpServletRequestWrapper {
    private final byte[] body;

    CachedBodyRequest(HttpServletRequest request, byte[] body) {
      super(request);
      this.body = body;
    }

    @Override
    public ServletInputStream getInputStream() {
      ByteArrayInputStream stream = new ByteArrayInputStream(body);
      return new ServletInputStream() {
        @Override
        public boolean isFinished() {
          return stream.available() == 0;
        }

        @Override
        public boolean isReady() {
          return true;
        }

        @Override
        public void setReadListener(ReadListener listener) {
          throw new UnsupportedOperationException();
        }

        @Override
        public int read() {
          return stream.read();
        }
      };
    }
  }
}
