package com.jvtech.gefinc.admin.user;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static com.jvtech.gefinc.support.ContractAssertions.responseMatchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.AdminClient;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Retirar o bloqueio temporário por tentativas de login (US3): depois de 5 falhas o login responde
 * 429 mesmo com a senha certa; {@code DELETE /admin/users/{id}/login-lock} libera na hora, é
 * auditado, é idempotente e zera só a contagem do e-mail, nunca a do IP.
 */
class LoginLockClearIT extends IntegrationTestBase {

  private static final String IP = "198.51.100.30";
  private static final String OTHER_IP = "203.0.113.55";

  private AdminClient api;
  private TestUser admin;
  private SeededUser adminRow;
  private SeededUser target;

  @BeforeEach
  void init() throws Exception {
    api = new AdminClient(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm@teste.com");
    admin = api.login(adminRow.id(), "adm@teste.com");
    target = seed.createUser("alvo@teste.com");
  }

  private ResultActions loginFrom(String email, String password, String ip) throws Exception {
    return mockMvc.perform(
        post("/auth/login")
            .with(
                request -> {
                  request.setRemoteAddr(ip);
                  return request;
                })
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                objectMapper.writeValueAsString(Map.of("email", email, "password", password))));
  }

  private void wrongPasswords(String email, int times, String ip) throws Exception {
    for (int i = 0; i < times; i++) {
      loginFrom(email, "senha-errada-999", ip).andExpect(status().isUnauthorized());
    }
  }

  private long clearedAudits() {
    return jdbc.queryForObject(
        "SELECT count(*) FROM audit_log WHERE action = 'LOGIN_LOCK_CLEARED'", Long.class);
  }

  @Test
  void aposOLimiteDeTentativasRetirarOBloqueioLiberaOLoginNaHora() throws Exception {
    wrongPasswords("alvo@teste.com", 5, IP);
    loginFrom("alvo@teste.com", TestUsers.PASSWORD, IP)
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"));
    JsonNode locked = api.json(api.detail(admin, target.id()).andExpect(status().isOk()));
    assertThat(locked.get("loginLock").get("lockedUntil").asText()).isNotBlank();

    api.clearLoginLock(admin, target.id())
        .andExpect(status().isNoContent())
        .andExpect(matchesContract());

    loginFrom("alvo@teste.com", TestUsers.PASSWORD, IP).andExpect(status().isOk());
    JsonNode released = api.json(api.detail(admin, target.id()).andExpect(status().isOk()));
    assertThat(released.has("loginLock")).isFalse();
  }

  @Test
  void retirarOBloqueioEAuditadoComAtorEAlvo() throws Exception {
    wrongPasswords("alvo@teste.com", 5, IP);

    api.clearLoginLock(admin, target.id()).andExpect(status().isNoContent());

    Map<String, Object> row =
        jdbc.queryForMap("SELECT * FROM audit_log WHERE action = 'LOGIN_LOCK_CLEARED'");
    assertThat(row)
        .containsEntry("result", "SUCCESS")
        .containsEntry("actor_kind", "ADMIN")
        .containsEntry("actor_user_id", adminRow.id())
        .containsEntry("target_user_id", target.id());
    assertThat(String.valueOf(row.get("details"))).isEqualTo("{}");
    assertThat(row.get("reason_text")).isNull();
  }

  @Test
  void semBloqueioVigenteEIdempotente() throws Exception {
    api.clearLoginLock(admin, target.id()).andExpect(status().isNoContent());
    api.clearLoginLock(admin, target.id()).andExpect(status().isNoContent());

    loginFrom("alvo@teste.com", TestUsers.PASSWORD, IP).andExpect(status().isOk());
    assertThat(clearedAudits()).isEqualTo(2);
  }

  @Test
  void naoZeraAContagemPorIp() throws Exception {
    wrongPasswords("alvo@teste.com", 5, IP);
    // outros 15 e-mails inexistentes falham do mesmo IP: o IP chega a 20 falhas
    for (int i = 0; i < 15; i++) {
      loginFrom("inexistente" + i + "@teste.com", "senha-errada-999", IP)
          .andExpect(status().isUnauthorized());
    }

    api.clearLoginLock(admin, target.id()).andExpect(status().isNoContent());

    // o e-mail foi liberado, mas o IP segue bloqueado
    loginFrom("alvo@teste.com", TestUsers.PASSWORD, IP).andExpect(status().isTooManyRequests());
    loginFrom("alvo@teste.com", TestUsers.PASSWORD, OTHER_IP).andExpect(status().isOk());
  }

  @Test
  void zeraSoOEmailDoAlvoENaoOdeOutraConta() throws Exception {
    seed.createUser("outro@teste.com");
    wrongPasswords("alvo@teste.com", 5, IP);
    wrongPasswords("outro@teste.com", 5, OTHER_IP);

    api.clearLoginLock(admin, target.id()).andExpect(status().isNoContent());

    loginFrom("alvo@teste.com", TestUsers.PASSWORD, "192.0.2.10").andExpect(status().isOk());
    loginFrom("outro@teste.com", TestUsers.PASSWORD, "192.0.2.11")
        .andExpect(status().isTooManyRequests());
  }

  @Test
  void bloqueioDeContaSuspensaTambemPodeSerRetirado() throws Exception {
    wrongPasswords("alvo@teste.com", 5, IP);
    api.suspend(admin, target.id(), "Motivo da suspensão").andExpect(status().isNoContent());

    api.clearLoginLock(admin, target.id()).andExpect(status().isNoContent());

    // liberado do bloqueio, mas a suspensão continua valendo
    loginFrom("alvo@teste.com", TestUsers.PASSWORD, IP)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"));
  }

  @Test
  void usuarioInexistenteDa404EAudita() throws Exception {
    api.clearLoginLock(admin, 999_999L)
        .andExpect(status().isNotFound())
        .andExpect(responseMatchesContract());

    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'LOGIN_LOCK_CLEARED'"
                    + " AND result = 'REFUSED' AND refusal_code = 'NOT_FOUND'",
                Long.class))
        .isEqualTo(1);
  }
}
