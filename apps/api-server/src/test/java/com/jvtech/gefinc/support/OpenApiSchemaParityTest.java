package com.jvtech.gefinc.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * O {@code AdminUserDetail} é plano (o validador de contrato recusa {@code allOf} entre objetos sem
 * {@code additionalProperties}) e repete os campos de {@code AdminUserRow}. Sem {@code allOf} nada
 * impede os dois de se afastarem; este teste exige que o detalhe contenha todas as propriedades da
 * linha, com a mesma definição, e que todo campo obrigatório da linha seja obrigatório no detalhe.
 */
class OpenApiSchemaParityTest {

  private static final Path SPEC =
      Path.of("..", "..", "packages", "core-models", "openapi", "gefinc.openapi.yaml")
          .toAbsolutePath()
          .normalize();

  @SuppressWarnings("unchecked")
  private static Map<String, Object> schema(String name) throws IOException {
    try (Reader reader = Files.newBufferedReader(SPEC)) {
      Map<String, Object> root = new Yaml().load(reader);
      Map<String, Object> components = (Map<String, Object>) root.get("components");
      Map<String, Object> schemas = (Map<String, Object>) components.get("schemas");
      return (Map<String, Object>) schemas.get(name);
    }
  }

  /** Diferenças: propriedade ausente ou com definição diferente, e obrigatório que não é. */
  @SuppressWarnings("unchecked")
  static List<String> divergences(Map<String, Object> base, Map<String, Object> extended) {
    List<String> found = new ArrayList<>();
    Map<String, Object> baseProperties = (Map<String, Object>) base.get("properties");
    Map<String, Object> extendedProperties = (Map<String, Object>) extended.get("properties");
    baseProperties.forEach(
        (name, definition) -> {
          if (!extendedProperties.containsKey(name)) {
            found.add("propriedade ausente: " + name);
          } else if (!definition.equals(extendedProperties.get(name))) {
            found.add("definição diferente: " + name);
          }
        });
    List<String> baseRequired = (List<String>) base.get("required");
    List<String> extendedRequired = (List<String>) extended.get("required");
    for (String name : baseRequired) {
      if (!extendedRequired.contains(name)) {
        found.add("obrigatório ausente: " + name);
      }
    }
    return found;
  }

  @Test
  void aSchemaAdminUserDetailContemTudoQueAdminUserRowTem() throws IOException {
    Map<String, Object> row = schema("AdminUserRow");
    Map<String, Object> detail = schema("AdminUserDetail");

    assertThat(row).isNotNull();
    assertThat(detail).isNotNull();
    assertThat(divergences(row, detail)).isEmpty();
  }

  @Test
  void oDetectorPegaPropriedadeAusenteDefinicaoDiferenteEObrigatorioFaltando() {
    Map<String, Object> base =
        Map.of(
            "properties",
            Map.of("id", Map.of("type", "integer"), "email", Map.of("type", "string")),
            "required",
            List.of("id", "email"));
    Map<String, Object> extended =
        Map.of("properties", Map.of("id", Map.of("type", "string")), "required", List.of("id"));

    assertThat(divergences(base, extended))
        .containsExactlyInAnyOrder(
            "definição diferente: id", "propriedade ausente: email", "obrigatório ausente: email");
  }
}
