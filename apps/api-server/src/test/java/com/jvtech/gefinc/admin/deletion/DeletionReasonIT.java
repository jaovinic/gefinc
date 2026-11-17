package com.jvtech.gefinc.admin.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Testes de integração de gestão dos motivos de exclusão (US11, T145): quatro iniciais, CRUD sem
 * DELETE, unicidade case-insensitive, proteção do último ativo, auditoria e fixação da mensagem nas
 * exclusões já solicitadas.
 */
class DeletionReasonIT extends IntegrationTestBase {

  private TestUsers testUsers;
  private TestUser admin;
  private SeededUser adminRow;

  @BeforeEach
  void setUp() throws Exception {
    testUsers = new TestUsers(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm-reasons@teste.com");
    String token =
        testUsers.login("adm-reasons@teste.com", TestUsers.PASSWORD).get("accessToken").asText();
    admin = new TestUser(adminRow.id(), adminRow.email(), token);
  }

  private String json(Object body) throws Exception {
    return objectMapper.writeValueAsString(body);
  }

  @Test
  void quatroMotivosIniciaisSemeadosEstaoAtivos() throws Exception {
    mockMvc
        .perform(get("/admin/deletion-reasons").header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(4))
        .andExpect(jsonPath("$[0].initial").value(true))
        .andExpect(jsonPath("$[0].active").value(true));
  }

  @Test
  void criarEditarDesativarReativarAuditadosSemDelete() throws Exception {
    // 1. Criar novo motivo
    var createBody =
        Map.of(
            "name",
            "Fraude confirmada",
            "message",
            "A conta foi encerrada devido a constatação de fraude nos termos do contrato.");

    var createResult =
        mockMvc
            .perform(
                post("/admin/deletion-reasons")
                    .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(createBody)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").isNumber())
            .andExpect(jsonPath("$.name").value("Fraude confirmada"))
            .andExpect(jsonPath("$.active").value(true))
            .andExpect(jsonPath("$.initial").value(false))
            .andReturn();

    long reasonId =
        objectMapper.readTree(createResult.getResponse().getContentAsString()).get("id").asLong();

    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'REASON_CREATED'", Long.class))
        .isEqualTo(1);

    // 2. Editar motivo
    var updateBody =
        Map.of(
            "name",
            "Fraude grave confirmada",
            "message",
            "A conta foi encerrada definitivamente devido a fraude grave.");

    mockMvc
        .perform(
            put("/admin/deletion-reasons/" + reasonId)
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(updateBody)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Fraude grave confirmada"));

    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'REASON_UPDATED'", Long.class))
        .isEqualTo(1);

    // 3. Desativar motivo
    mockMvc
        .perform(
            post("/admin/deletion-reasons/" + reasonId + "/deactivate")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isNoContent());

    assertThat(
            jdbc.queryForObject(
                "SELECT active FROM deletion_reasons WHERE id = ?", Boolean.class, reasonId))
        .isFalse();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'REASON_DEACTIVATED'", Long.class))
        .isEqualTo(1);

    // 4. Reativar motivo
    mockMvc
        .perform(
            post("/admin/deletion-reasons/" + reasonId + "/activate")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isNoContent());

    assertThat(
            jdbc.queryForObject(
                "SELECT active FROM deletion_reasons WHERE id = ?", Boolean.class, reasonId))
        .isTrue();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'REASON_ACTIVATED'", Long.class))
        .isEqualTo(1);

    // 5. DELETE não existe (405 Method Not Allowed)
    mockMvc
        .perform(
            delete("/admin/deletion-reasons/" + reasonId)
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isMethodNotAllowed());
  }

  @Test
  void nomeRepetidoSemDiferenciarCaixaDa409ReasonNameTaken() throws Exception {
    var body =
        Map.of(
            "name",
            "solicitação do titular dos dados", // minúsculas
            "message",
            "Mensagem válida em português.");

    mockMvc
        .perform(
            post("/admin/deletion-reasons")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("REASON_NAME_TAKEN"));
  }

  @Test
  void desativarOUltimoMotivoAtivoDa409LastActiveReason() throws Exception {
    // Desativa 3 dos 4 motivos iniciais
    var activeIds =
        jdbc.queryForList("SELECT id FROM deletion_reasons WHERE active = true", Long.class);
    assertThat(activeIds).hasSize(4);

    for (int i = 0; i < 3; i++) {
      mockMvc
          .perform(
              post("/admin/deletion-reasons/" + activeIds.get(i) + "/deactivate")
                  .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
          .andExpect(status().isNoContent());
    }

    // O 4º motivo ativo não pode ser desativado
    long lastId = activeIds.get(3);
    mockMvc
        .perform(
            post("/admin/deletion-reasons/" + lastId + "/deactivate")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LAST_ACTIVE_REASON"));

    assertThat(
            jdbc.queryForObject(
                "SELECT active FROM deletion_reasons WHERE id = ?", Boolean.class, lastId))
        .isTrue();
  }

  @Test
  void editarMotivoNaoAlteraMensagemFixadaEmExclusoesJaSolicitadas() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-fixado@teste.com");
    long reasonId =
        jdbc.queryForObject(
            "SELECT id FROM deletion_reasons WHERE name = 'Solicitação do titular dos dados'",
            Long.class);
    String originalMessage =
        jdbc.queryForObject(
            "SELECT message FROM deletion_reasons WHERE id = ?", String.class, reasonId);

    // Solicita exclusão com este motivo
    var requestBody =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Titular requereu por e-mail",
            "mode",
            "GRACE",
            "days",
            15,
            "confirmEmail",
            alvo.email(),
            "password",
            TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + alvo.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(requestBody)))
        .andExpect(status().isOk());

    // Edita o motivo
    var updateBody =
        Map.of(
            "name", "Solicitação do titular dos dados (alterado)",
            "message", "Nova mensagem genérica completamente diferente.");

    mockMvc
        .perform(
            put("/admin/deletion-reasons/" + reasonId)
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(updateBody)))
        .andExpect(status().isOk());

    // A solicitação no livro-razão mantém a mensagem original fixada
    String savedMessage =
        jdbc.queryForObject(
            "SELECT reason_message FROM account_deletion_requests WHERE user_id = ?",
            String.class,
            alvo.id());
    assertThat(savedMessage).isEqualTo(originalMessage);
  }
}
