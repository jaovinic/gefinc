package com.jvtech.gefinc.category;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

class CategoryApiIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private TestUser bia;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    ana = users.registerAndLogin("ana@example.com");
    bia = users.registerAndLogin("bia@example.com");
  }

  private Map<String, Object> body(String name, String type, String color) {
    return Map.of("name", name, "type", type, "colorHex", color);
  }

  @Test
  void cadastroCriaAsCategoriasIniciais() throws Exception {
    api.call(ana, HttpMethod.GET, "/categories", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.length()").value(11));
    JsonNode income = api.get(ana, "/categories?type=INCOME");
    assertThat(income).hasSize(2);
    assertThat(income.findValuesAsText("name"))
        .containsExactlyInAnyOrder("Salário", "Outras receitas");
    JsonNode expense = api.get(ana, "/categories?type=EXPENSE");
    assertThat(expense).hasSize(9);
    assertThat(expense.get(0).get("colorHex").asText()).matches("^#[0-9A-Fa-f]{6}$");
  }

  @Test
  void criaEditaEExcluiCategoriaSemUso() throws Exception {
    JsonNode created =
        api.json(
            api.call(ana, HttpMethod.POST, "/categories", body("Pets", "EXPENSE", "#112233"))
                .andExpect(status().isCreated())
                .andExpect(matchesContract()));
    long id = created.get("id").asLong();

    api.call(ana, HttpMethod.PUT, "/categories/" + id, body("Animais", "EXPENSE", "#445566"))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.name").value("Animais"))
        .andExpect(jsonPath("$.colorHex").value("#445566"));

    api.call(ana, HttpMethod.DELETE, "/categories/" + id, null).andExpect(status().isNoContent());
    api.call(ana, HttpMethod.PUT, "/categories/" + id, body("X", "EXPENSE", "#445566"))
        .andExpect(status().isNotFound());
  }

  @Test
  void nomeUnicoPorTipoSemDiferenciarMaiusculas() throws Exception {
    api.call(ana, HttpMethod.POST, "/categories", body("alimentação", "EXPENSE", "#112233"))
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("CATEGORY_NAME_TAKEN"));
    // o mesmo nome em outro tipo é permitido
    api.call(ana, HttpMethod.POST, "/categories", body("Alimentação", "INCOME", "#112233"))
        .andExpect(status().isCreated());
  }

  @Test
  void recusaCorInvalidaNomeVazioETrocaDeTipo() throws Exception {
    api.call(ana, HttpMethod.POST, "/categories", body("Pets", "EXPENSE", "vermelho"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='colorHex')]").exists());
    api.call(ana, HttpMethod.POST, "/categories", body(" ", "EXPENSE", "#112233"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='name')]").exists());

    long id = api.category(ana, "Lazer");
    api.call(ana, HttpMethod.PUT, "/categories/" + id, body("Lazer", "INCOME", "#112233"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='type')]").exists());
  }

  @Test
  void categoriaEmUsoNaoEExcluidaEOsLancamentosFicamIntactos() throws Exception {
    long account = api.checking(ana, "Itaú");
    long lazer = api.category(ana, "Lazer");
    long viagens =
        api.json(
                api.call(
                    ana, HttpMethod.POST, "/categories", body("Viagens", "EXPENSE", "#00AA00")))
            .get("id")
            .asLong();
    JsonNode group =
        api.createGroup(
            ana, api.variableBody("Cinema", "40.00", account, lazer, "2026-11-08", "2026-11-08"));

    api.call(ana, HttpMethod.DELETE, "/categories/" + lazer, null)
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("CATEGORY_IN_USE"))
        .andExpect(jsonPath("$.transactionCount").value(1))
        .andExpect(jsonPath("$.groupCount").value(1))
        .andExpect(
            jsonPath("$.detail")
                .value(
                    "Esta categoria não pode ser excluída: está em uso em 1 lançamento."
                        + " Altere a categoria desses lançamentos e tente novamente."));

    // reassignTo foi removido: o parâmetro é ignorado e nada é movido nem excluído
    api.call(ana, HttpMethod.DELETE, "/categories/" + lazer + "?reassignTo=" + viagens, null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CATEGORY_IN_USE"));

    assertThat(api.get(ana, "/categories").findValues("id"))
        .extracting(JsonNode::asLong)
        .contains(lazer, viagens);
    JsonNode unchanged = api.get(ana, "/transaction-groups/" + group.get("id").asLong());
    assertThat(unchanged.get("categoryId").asLong()).isEqualTo(lazer);
    assertThat(unchanged.get("transactions").get(0).get("categoryId").asLong()).isEqualTo(lazer);

    // liberada a categoria (lançamentos removidos), a exclusão passa
    api.call(
            ana,
            HttpMethod.DELETE,
            "/transaction-groups/" + group.get("id").asLong() + "?confirm=true",
            null)
        .andExpect(status().isNoContent());
    api.call(ana, HttpMethod.DELETE, "/categories/" + lazer, null)
        .andExpect(status().isNoContent());
  }

  @Test
  void usoDaCategoriaInformaAsContagens() throws Exception {
    long account = api.checking(ana, "Itaú");
    long lazer = api.category(ana, "Lazer");
    api.call(ana, HttpMethod.GET, "/categories/" + lazer + "/usage", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.canDelete").value(true))
        .andExpect(jsonPath("$.transactionCount").value(0))
        .andExpect(jsonPath("$.groupCount").value(0));

    api.createGroup(
        ana, api.variableBody("Cinema", "40.00", account, lazer, "2026-11-08", "2026-11-08"));
    api.createGroup(
        ana, api.variableBody("Teatro", "60.00", account, lazer, "2026-11-09", "2026-11-09"));
    api.call(ana, HttpMethod.GET, "/categories/" + lazer + "/usage", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.canDelete").value(false))
        .andExpect(jsonPath("$.transactionCount").value(2))
        .andExpect(jsonPath("$.groupCount").value(2));
  }

  @Test
  void excluirOuVerUsoDeCategoriaDeOutroUsuarioRespondeNaoEncontrado() throws Exception {
    long anaCategory = api.category(ana, "Lazer");
    api.call(bia, HttpMethod.GET, "/categories/" + anaCategory + "/usage", null)
        .andExpect(status().isNotFound());
    api.call(bia, HttpMethod.DELETE, "/categories/" + anaCategory, null)
        .andExpect(status().isNotFound());
    api.call(ana, HttpMethod.GET, "/categories/" + anaCategory + "/usage", null)
        .andExpect(status().isOk());
  }

  @Test
  void usuariosNaoEnxergamNemAlteramCategoriasUmDoOutro() throws Exception {
    long anaCategory = api.category(ana, "Lazer");
    assertThat(api.get(bia, "/categories").findValues("id"))
        .extracting(JsonNode::asLong)
        .doesNotContain(anaCategory);

    api.call(
            bia,
            HttpMethod.PUT,
            "/categories/" + anaCategory,
            body("Invadida", "EXPENSE", "#112233"))
        .andExpect(status().isNotFound());
    api.call(bia, HttpMethod.DELETE, "/categories/" + anaCategory, null)
        .andExpect(status().isNotFound());
  }
}
