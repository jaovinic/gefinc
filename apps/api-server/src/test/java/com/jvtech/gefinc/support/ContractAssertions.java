package com.jvtech.gefinc.support;

import com.atlassian.oai.validator.OpenApiInteractionValidator;
import com.atlassian.oai.validator.mockmvc.OpenApiValidationMatchers;
import java.nio.file.Path;
import org.springframework.test.web.servlet.ResultMatcher;

/**
 * Valida requisição e resposta do MockMvc contra o contrato OpenAPI de {@code
 * packages/core-models/openapi/gefinc.openapi.yaml}. O MockMvc não usa o prefixo {@code /api/v1},
 * então o caminho base do contrato é ignorado.
 */
public final class ContractAssertions {

  private static final Path SPEC =
      Path.of("..", "..", "packages", "core-models", "openapi", "gefinc.openapi.yaml")
          .toAbsolutePath()
          .normalize();

  private static final OpenApiInteractionValidator VALIDATOR =
      OpenApiInteractionValidator.createForSpecificationUrl(SPEC.toUri().toString())
          .withBasePathOverride("")
          .build();

  private ContractAssertions() {}

  public static OpenApiInteractionValidator validator() {
    return VALIDATOR;
  }

  /** Verifica que a interação (requisição e resposta) respeita o contrato. */
  public static ResultMatcher matchesContract() {
    return OpenApiValidationMatchers.openApi().isValid(VALIDATOR);
  }
}
