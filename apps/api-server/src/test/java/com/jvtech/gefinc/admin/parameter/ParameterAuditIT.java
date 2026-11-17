package com.jvtech.gefinc.admin.parameter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Auditoria e validação de parâmetros globais (US8, T115, FR-031, FR-032): - Alterar parâmetro
 * grava valor anterior e novo na auditoria (PARAMETER_CHANGED); - Mensagem de manutenção <= 280
 * (acima disso responde 422 VALIDATION_ERROR); - Parâmetros somente leitura vêm marcados
 * editable=false; - Linha ausente = padrão.
 */
class ParameterAuditIT extends IntegrationTestBase {

  @Autowired private SystemParameterService parameterService;

  private TestUsers users;
  private String adminToken;
  private long adminId;

  @BeforeEach
  void setup() throws Exception {
    users = new TestUsers(mockMvc, objectMapper);
    adminId = seed.createAdmin("audit-admin@exemplo.com").id();
    var login = users.login("audit-admin@exemplo.com", TestUsers.PASSWORD);
    adminToken = login.get("accessToken").asText();
  }

  @Test
  void alterarParametroGravaValorAnteriorENovoNaAuditoria() throws Exception {
    // 1. Altera SIGNUPS_OPEN de true para false
    mockMvc
        .perform(
            put("/admin/parameters/signups-open")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("open", false))))
        .andExpect(status().isNoContent());

    // Confere auditoria
    var auditRow =
        jdbc.queryForMap(
            "SELECT action, details FROM audit_log WHERE action = 'PARAMETER_CHANGED'"
                + " AND details->>'parameter' = 'SIGNUPS_OPEN'");
    assertThat(auditRow.get("action")).isEqualTo("PARAMETER_CHANGED");
    String detailsJson = auditRow.get("details").toString();
    JsonNode details = objectMapper.readTree(detailsJson);
    assertThat(details.get("parameter").asText()).isEqualTo("SIGNUPS_OPEN");
    assertThat(details.get("from").asText()).isEqualTo("true");
    assertThat(details.get("to").asText()).isEqualTo("false");

    // 2. Altera MAINTENANCE_ENABLED de false para true com mensagem
    mockMvc
        .perform(
            put("/admin/parameters/maintenance")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("enabled", true, "message", "Aviso de manutenção"))))
        .andExpect(status().isNoContent());

    var maintAudit =
        jdbc.queryForMap(
            "SELECT action, details FROM audit_log WHERE action = 'PARAMETER_CHANGED'"
                + " AND details->>'parameter' = 'MAINTENANCE_ENABLED'");
    JsonNode maintDetails = objectMapper.readTree(maintAudit.get("details").toString());
    assertThat(maintDetails.get("parameter").asText()).isEqualTo("MAINTENANCE_ENABLED");
    assertThat(maintDetails.get("from").asText()).isEqualTo("false");
    assertThat(maintDetails.get("to").asText()).isEqualTo("true");

    var msgAudit =
        jdbc.queryForMap(
            "SELECT action, details FROM audit_log WHERE action = 'PARAMETER_CHANGED'"
                + " AND details->>'parameter' = 'MAINTENANCE_MESSAGE'");
    JsonNode msgDetails = objectMapper.readTree(msgAudit.get("details").toString());
    assertThat(msgDetails.get("parameter").asText()).isEqualTo("MAINTENANCE_MESSAGE");
    assertThat(msgDetails.get("from").asText()).isEqualTo("");
    assertThat(msgDetails.get("to").asText()).isEqualTo("Aviso de manutenção");
  }

  @Test
  void mensagemDeManutencaoComCaractereNuloERecusadaCom422() throws Exception {
    mockMvc
        .perform(
            put("/admin/parameters/maintenance")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("enabled", true, "message", "Aviso com \0 nulo"))))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
  }

  @Test
  void mensagemDeManutencaoMaiorQue280CaracteresERecusadaCom422() throws Exception {
    String longMessage = "A".repeat(281);
    mockMvc
        .perform(
            put("/admin/parameters/maintenance")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("enabled", true, "message", longMessage))))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
  }

  @Test
  void parametrosSomenteLeituraVemMarcadosEditableFalseELinhasAusentesTemPadrao() throws Exception {
    // Apaga todas as linhas de system_parameters para testar resiliência
    jdbc.execute("DELETE FROM system_parameters");
    parameterService.invalidateCache();

    var result =
        mockMvc
            .perform(
                get("/admin/parameters").header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.editable").isArray())
            .andExpect(jsonPath("$.readOnly").isArray())
            .andReturn();

    JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
    JsonNode editable = body.get("editable");
    JsonNode readOnly = body.get("readOnly");

    assertThat(editable).isNotEmpty();
    assertThat(readOnly).isNotEmpty();

    // Editable com valores padrão
    boolean foundSignups = false;
    for (JsonNode node : editable) {
      assertThat(node.get("editable").asBoolean()).isTrue();
      if ("SIGNUPS_OPEN".equals(node.get("key").asText())) {
        foundSignups = true;
        assertThat(node.get("value").asText()).isEqualTo("true");
      }
    }
    assertThat(foundSignups).isTrue();

    // Read-only com editable=false
    for (JsonNode node : readOnly) {
      assertThat(node.get("editable").asBoolean()).isFalse();
      assertThat(node.get("key").asText()).isNotEmpty();
      assertThat(node.get("value").asText()).isNotEmpty();
      assertThat(node.get("label").asText()).isNotEmpty();
    }
  }
}
