package com.jvtech.gefinc.common.error;

import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.http.ProblemDetail;

/**
 * Monta o corpo {@code problem+json} padrão da API (usado pelo handler global e pela segurança).
 */
public final class ProblemFactory {

  private ProblemFactory() {}

  public static ProblemDetail create(
      ErrorCode code, String detail, Map<String, Object> extras, List<Map<String, String>> errors) {
    ProblemDetail body = ProblemDetail.forStatusAndDetail(code.status(), detail);
    body.setType(
        URI.create("https://gefinc.app/problems/" + code.name().toLowerCase().replace('_', '-')));
    body.setTitle(code.title());
    body.setProperty("code", code.name());
    extras.forEach(body::setProperty);
    if (!errors.isEmpty()) {
      body.setProperty("errors", errors);
    }
    return body;
  }

  public static ProblemDetail create(ErrorCode code, String detail) {
    return create(code, detail, Map.of(), List.of());
  }
}
