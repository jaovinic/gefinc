package com.jvtech.gefinc.admin.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.admin.common.AdminPolicy;
import com.jvtech.gefinc.admin.common.AdminPolicy.Action;
import com.jvtech.gefinc.admin.common.AdminPolicy.Subject;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import com.jvtech.gefinc.user.UserRole;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Proteção do último administrador (US1, R14): - O sistema nunca pode ficar sem ao menos um
 * administrador ativo (ADMIN ou ROOT). - Cenário com 1 admin ativo e nenhum root -> 409 LAST_ADMIN.
 * - Cenário com 1 admin ativo e 1 suspenso / em exclusão -> 409 LAST_ADMIN. - Cenário com 1 admin
 * ativo e 1 root ativo -> Permitido.
 */
class LastAdminProtectionIT extends IntegrationTestBase {

  @Autowired private AdminPolicy adminPolicy;
  @Autowired private org.springframework.transaction.PlatformTransactionManager transactionManager;

  private TestApi api;
  private TestUsers users;
  private TransactionTemplate tx;

  @BeforeEach
  void init() {
    api = new TestApi(mockMvc, objectMapper);
    users = new TestUsers(mockMvc, objectMapper);
    tx = new TransactionTemplate(transactionManager);
  }

  private TestUser login(SeededUser user, String email) throws Exception {
    String token = users.login(email, TestUsers.PASSWORD).get("accessToken").asText();
    return new TestUser(user.id(), email, token);
  }

  @Test
  void umAdminAtivoESemRootRecusaReduzirComLastAdmin() throws Exception {
    SeededUser admin = seed.createAdmin("adm@example.com");
    TestUser session = login(admin, "adm@example.com");

    // Tentativa de autoexclusão do único administrador ativo
    api.call(
            session,
            HttpMethod.POST,
            "/auth/account-deletion",
            Map.of("password", TestUsers.PASSWORD))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LAST_ADMIN"));

    // Verificação direta pela política (requireAnotherActiveAdmin e enforce)
    Subject actor = new Subject(admin.id(), UserRole.ADMIN, true);
    Subject target = new Subject(admin.id(), UserRole.ADMIN, true);
    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    status -> adminPolicy.enforce(Action.REVOKE_ADMIN, actor, target)))
        .isInstanceOf(ApiException.class)
        .satisfies(
            e ->
                assertThat(((ApiException) e).code())
                    .isIn(ErrorCode.SELF_ACTION_FORBIDDEN, ErrorCode.LAST_ADMIN));

    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    status -> adminPolicy.requireAnotherActiveAdmin(admin.id())))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo(ErrorCode.LAST_ADMIN));
  }

  @Test
  void umAdminAtivoEOutroSuspensoRecusaReduzirComLastAdmin() throws Exception {
    SeededUser adminAtivo = seed.createAdmin("ativo@example.com");
    SeededUser adminSuspenso = seed.createAdmin("suspenso@example.com");
    jdbc.update("UPDATE users SET suspended_at = now() WHERE id = ?", adminSuspenso.id());

    TestUser sessionAtivo = login(adminAtivo, "ativo@example.com");

    // O admin ativo tenta autoexclusão, mas o outro está suspenso: 409 LAST_ADMIN
    api.call(
            sessionAtivo,
            HttpMethod.POST,
            "/auth/account-deletion",
            Map.of("password", TestUsers.PASSWORD))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LAST_ADMIN"));

    // Diretamente em política sob transação
    Subject actor = new Subject(adminSuspenso.id(), UserRole.ADMIN, false);
    Subject target = new Subject(adminAtivo.id(), UserRole.ADMIN, true);
    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    status -> adminPolicy.enforce(Action.REVOKE_ADMIN, actor, target)))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo(ErrorCode.LAST_ADMIN));

    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    status -> adminPolicy.requireAnotherActiveAdmin(adminAtivo.id())))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo(ErrorCode.LAST_ADMIN));
  }

  @Test
  void umAdminAtivoEOutroEmExclusaoRecusaReduzirComLastAdmin() throws Exception {
    SeededUser adminAtivo = seed.createAdmin("ativo@example.com");
    SeededUser adminExclusao = seed.createAdmin("exclusao@example.com");
    long ledger =
        jdbc.queryForObject(
            "INSERT INTO account_deletion_requests (user_id, origin, mode, grace_days, requested_at,"
                + " due_at, status, notice_state) VALUES (?, 'USER', 'GRACE', 30, now(),"
                + " now() + interval '720 hours', 'SCHEDULED', 'NOT_APPLICABLE') RETURNING id",
            Long.class,
            adminExclusao.id());
    jdbc.update(
        "UPDATE users SET deletion_requested_at = now(), deletion_due_at = now() + interval"
            + " '720 hours', deletion_origin = 'USER', deletion_request_id = ? WHERE id = ?",
        ledger,
        adminExclusao.id());

    TestUser sessionAtivo = login(adminAtivo, "ativo@example.com");

    api.call(
            sessionAtivo,
            HttpMethod.POST,
            "/auth/account-deletion",
            Map.of("password", TestUsers.PASSWORD))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LAST_ADMIN"));

    Subject actor = new Subject(adminExclusao.id(), UserRole.ADMIN, false);
    Subject target = new Subject(adminAtivo.id(), UserRole.ADMIN, true);
    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    status -> adminPolicy.enforce(Action.REVOKE_ADMIN, actor, target)))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo(ErrorCode.LAST_ADMIN));

    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    status -> adminPolicy.requireAnotherActiveAdmin(adminAtivo.id())))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo(ErrorCode.LAST_ADMIN));
  }

  @Test
  void umAdminAtivoEUmRootAtivoPermiteRetirarOAdmin() throws Exception {
    SeededUser root = seed.createRoot("raiz@example.com");
    SeededUser admin = seed.createAdmin("adm@example.com");
    TestUser rootSession = login(root, "raiz@example.com");

    // Raiz retira o perfil de administrador do único admin ativo: permitido (pois o raiz conta como
    // ativo)
    api.call(
            rootSession,
            HttpMethod.PUT,
            "/admin/users/" + admin.id() + "/role",
            Map.of("role", "USER", "password", TestUsers.PASSWORD))
        .andExpect(status().isNoContent());

    assertThat(jdbc.queryForObject("SELECT role FROM users WHERE id = ?", String.class, admin.id()))
        .isEqualTo("USER");

    // O admin também pode pedir autoexclusão se houver raiz ativo
    SeededUser outroAdmin = seed.createAdmin("outro@example.com");
    TestUser outroSession = login(outroAdmin, "outro@example.com");

    api.call(
            outroSession,
            HttpMethod.POST,
            "/auth/account-deletion",
            Map.of("password", TestUsers.PASSWORD))
        .andExpect(status().isAccepted());

    // Política diretamente sob transação
    tx.executeWithoutResult(
        status -> {
          Subject actor = new Subject(root.id(), UserRole.ROOT, true);
          Subject target = new Subject(outroAdmin.id(), UserRole.ADMIN, true);
          assertThatCode(() -> adminPolicy.enforce(Action.REVOKE_ADMIN, actor, target))
              .doesNotThrowAnyException();
          assertThatCode(() -> adminPolicy.requireAnotherActiveAdmin(outroAdmin.id()))
              .doesNotThrowAnyException();
        });
  }
}
