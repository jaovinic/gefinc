package com.jvtech.gefinc.category;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * As categorias padrão do semeador são exatamente as de {@code default-categories.json}, a mesma
 * fonte que o teste de cores do ui-shared (distinção entre fatias e contraste) lê. Mudar o semeador
 * sem atualizar o arquivo, ou o inverso, quebra este teste.
 */
class DefaultCategorySeederTest {

  private static final Path FIXTURE =
      Path.of("..", "..", "packages", "core-models", "fixtures", "default-categories.json");

  @Test
  void categoriasPadraoSaoAsDoArquivoCompartilhado() throws IOException {
    JsonNode root = new ObjectMapper().readTree(FIXTURE.toFile());
    List<DefaultCategorySeeder.Seed> expected = new ArrayList<>();
    add(expected, root.get("expense"), CategoryType.EXPENSE);
    add(expected, root.get("income"), CategoryType.INCOME);

    assertThat(DefaultCategorySeeder.DEFAULTS).containsExactlyElementsOf(expected);
  }

  private static void add(
      List<DefaultCategorySeeder.Seed> target, JsonNode entries, CategoryType type) {
    for (JsonNode entry : entries) {
      target.add(
          new DefaultCategorySeeder.Seed(
              entry.get("name").asText(), type, entry.get("color").asText()));
    }
  }
}
