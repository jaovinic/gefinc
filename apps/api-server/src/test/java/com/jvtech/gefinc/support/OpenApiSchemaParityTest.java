package com.jvtech.gefinc.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.admin.audit.AuditClientView;
import com.jvtech.gefinc.admin.audit.AuditEntryView;
import com.jvtech.gefinc.admin.audit.AuditPageView;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.ForcePasswordResetRequest;
import java.io.IOException;
import java.io.Reader;
import java.lang.reflect.RecordComponent;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * Paridade do contrato: o {@code AdminUserDetail} contém tudo que o {@code AdminUserRow} tem e os
 * DTOs da auditoria ({@code AuditEntryView}, {@code AuditClientView}, {@code AuditPageView}) têm
 * exatamente as propriedades das schemas {@code AuditEntry}, {@code AuditClient} e {@code
 * AuditPage}, com o mesmo conjunto de campos obrigatórios presentes.
 *
 * <p>O {@code AdminUserDetail} é plano (o validador de contrato recusa {@code allOf} entre objetos
 * sem {@code additionalProperties}) e repete os campos de {@code AdminUserRow}. Sem {@code allOf}
 * nada impede os dois de se afastarem; este teste exige que o detalhe contenha todas as
 * propriedades da linha, com a mesma definição, e que todo campo obrigatório da linha seja
 * obrigatório no detalhe.
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

  @SuppressWarnings("unchecked")
  private static Set<String> propertyNames(Map<String, Object> schema) {
    return ((Map<String, Object>) schema.get("properties")).keySet();
  }

  @SuppressWarnings("unchecked")
  private static List<String> required(Map<String, Object> schema) {
    return (List<String>) schema.getOrDefault("required", List.of());
  }

  private static List<String> components(Class<? extends Record> type) {
    return Arrays.stream(type.getRecordComponents()).map(RecordComponent::getName).toList();
  }

  private void assertRecordMatchesSchema(String schemaName, Class<? extends Record> type)
      throws IOException {
    Map<String, Object> schema = schema(schemaName);

    assertThat(schema).as("schema %s", schemaName).isNotNull();
    assertThat(propertyNames(schema))
        .as("propriedades de %s x componentes de %s", schemaName, type.getSimpleName())
        .containsExactlyInAnyOrderElementsOf(components(type));
    assertThat(components(type)).containsAll(required(schema));
  }

  @Test
  void asSchemasDaAuditoriaTemAsMesmasPropriedadesDosRecordsDaApi() throws IOException {
    assertRecordMatchesSchema("AuditEntry", AuditEntryView.class);
    assertRecordMatchesSchema("AuditClient", AuditClientView.class);
    assertRecordMatchesSchema("AuditPage", AuditPageView.class);
    assertRecordMatchesSchema("ForcePasswordResetRequest", ForcePasswordResetRequest.class);
  }

  @Test
  void aSchemaAuditEntryTemOClientOpcionalEIpEDispositivoSoNele() throws IOException {
    Map<String, Object> entry = schema("AuditEntry");
    Map<String, Object> client = schema("AuditClient");

    assertThat(propertyNames(entry)).contains("client");
    assertThat(required(entry)).doesNotContain("client");
    assertThat(required(client)).containsExactly("ref");
    assertThat(propertyNames(client)).containsExactlyInAnyOrder("ref", "ip", "device");
    assertThat(propertyNames(entry)).doesNotContain("ip", "device", "clientRef");
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
