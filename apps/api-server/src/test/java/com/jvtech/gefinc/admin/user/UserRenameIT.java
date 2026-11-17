package com.jvtech.gefinc.admin.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Renomeação administrativa de usuários (US9, T126):
 *
 * <ul>
 *   <li>PATCH /admin/users/{userId} altera nome de exibição imediatamente;
 *   <li>Nome de até 80 caracteres;
 *   <li>Nome vazio ou nulo limpa o nome;
 *   <li>Nome maior que 80 ou com caractere NUL responde 422 VALIDATION_ERROR;
 *   <li>Usuário inexistente responde 404 NOT_FOUND e audita a recusa sem alvo;
 *   <li>Permite renomear inclusive o usuário raiz (ROOT);
 *   <li>Audita USER_RENAMED registrando no details oldNameRef (pseudonimizado);
 *   <li>Acesso restrito a administradores (403 para usuário comum, 401 visitante).
 * </ul>
 */
class UserRenameIT extends IntegrationTestBase {

  @Autowired private Pseudonymizer pseudonymizer;

  private TestUsers users;
  private SeededUser adminRow;
  private TestUser admin;
  private SeededUser targetRow;
  private SeededUser rootRow;

  @BeforeEach
  void init() throws Exception {
    users = new TestUsers(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm-rename@example.com");
    admin =
        new TestUser(
            adminRow.id(),
            "adm-rename@example.com",
            users.login("adm-rename@example.com", TestUsers.PASSWORD).get("accessToken").asText());

    targetRow = seed.createUser("alvo-rename@example.com");
    // Define um nome inicial para testar a captura de oldNameRef
    jdbc.update("UPDATE users SET name = 'Nome Anterior' WHERE id = ?", targetRow.id());

    rootRow = seed.createRoot("raiz-rename@example.com");
  }

  @Test
  void renomearUsuarioComSucessoAuditaComOldNameRef() throws Exception {
    mockMvc
        .perform(
            patch("/admin/users/" + targetRow.id())
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", "Novo Nome de Exibição"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(targetRow.id()))
        .andExpect(jsonPath("$.name").value("Novo Nome de Exibição"));

    // Confere no banco
    assertThat(
            jdbc.queryForObject(
                "SELECT name FROM users WHERE id = ?", String.class, targetRow.id()))
        .isEqualTo("Novo Nome de Exibição");

    // Confere auditoria
    Map<String, Object> audit =
        jdbc.queryForMap(
            "SELECT * FROM audit_log WHERE action = 'USER_RENAMED' AND target_user_id = ?",
            targetRow.id());
    assertThat(audit.get("result")).isEqualTo("SUCCESS");
    assertThat(audit.get("actor_user_id")).isEqualTo(adminRow.id());
    assertThat(audit.get("details").toString()).contains(pseudonymizer.nameRef("Nome Anterior"));
  }

  @Test
  void nomeVazioOuNuloLimpaONome() throws Exception {
    // 1. Limpa com string vazia
    mockMvc
        .perform(
            patch("/admin/users/" + targetRow.id())
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", "   "))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").doesNotExist());

    assertThat(
            jdbc.queryForObject(
                "SELECT name IS NULL FROM users WHERE id = ?", Boolean.class, targetRow.id()))
        .isTrue();

    // 2. Define outro nome e limpa com null
    jdbc.update("UPDATE users SET name = 'Outro' WHERE id = ?", targetRow.id());
    Map<String, Object> body = new HashMap<>();
    body.put("name", null);

    mockMvc
        .perform(
            patch("/admin/users/" + targetRow.id())
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").doesNotExist());

    assertThat(
            jdbc.queryForObject(
                "SELECT name IS NULL FROM users WHERE id = ?", Boolean.class, targetRow.id()))
        .isTrue();
  }

  @Test
  void nomeMaiorQue80CaracteresResponde422() throws Exception {
    String longName = "A".repeat(81);
    mockMvc
        .perform(
            patch("/admin/users/" + targetRow.id())
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", longName))))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
        .andExpect(jsonPath("$.errors[0].field").value("name"));

    assertThat(
            jdbc.queryForObject(
                "SELECT name FROM users WHERE id = ?", String.class, targetRow.id()))
        .isEqualTo("Nome Anterior");
  }

  @Test
  void nomeComCaractereNulResponde422() throws Exception {
    mockMvc
        .perform(
            patch("/admin/users/" + targetRow.id())
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", "Nome\0Invalido"))))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
        .andExpect(jsonPath("$.errors[0].field").value("name"));
  }

  @Test
  void usuarioInexistenteResponde404AuditadoSemAlvo() throws Exception {
    mockMvc
        .perform(
            patch("/admin/users/999999")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", "Teste"))))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"));

    Map<String, Object> audit =
        jdbc.queryForMap(
            "SELECT * FROM audit_log WHERE action = 'USER_RENAMED' AND refusal_code = 'NOT_FOUND'");
    assertThat(audit.get("result")).isEqualTo("REFUSED");
    assertThat(audit.get("target_user_id")).isNull();
  }

  @Test
  void permiteRenomearInclusiveOUsuarioRaiz() throws Exception {
    mockMvc
        .perform(
            patch("/admin/users/" + rootRow.id())
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", "Raiz Supremo"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(rootRow.id()))
        .andExpect(jsonPath("$.name").value("Raiz Supremo"));

    assertThat(
            jdbc.queryForObject("SELECT name FROM users WHERE id = ?", String.class, rootRow.id()))
        .isEqualTo("Raiz Supremo");

    Map<String, Object> audit =
        jdbc.queryForMap(
            "SELECT * FROM audit_log WHERE action = 'USER_RENAMED' AND target_user_id = ?",
            rootRow.id());
    assertThat(audit.get("result")).isEqualTo("SUCCESS");
  }

  @Test
  void usuarioComumRecebe403EVisitanteRecebe401() throws Exception {
    TestUser normalUser = users.registerAndLogin("normal-rename@example.com");

    mockMvc
        .perform(
            patch("/admin/users/" + targetRow.id())
                .header(HttpHeaders.AUTHORIZATION, normalUser.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", "Invasor"))))
        .andExpect(status().isForbidden());

    mockMvc
        .perform(
            patch("/admin/users/" + targetRow.id())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", "Visitante"))))
        .andExpect(status().isUnauthorized());
  }
}
