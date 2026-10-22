package com.jvtech.gefinc.auth;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import jakarta.mail.internet.MimeMessage;
import java.time.Duration;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class PasswordResetIT extends IntegrationTestBase {

  private static final Pattern LINK_TOKEN = Pattern.compile("token=([A-Za-z0-9_-]+)");

  private TestUsers users;

  @BeforeEach
  void init() {
    users = new TestUsers(mockMvc, objectMapper);
  }

  private void requestReset(String email, int expectedStatus) throws Exception {
    mockMvc
        .perform(
            post("/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
        .andExpect(status().is(expectedStatus));
  }

  private String lastTokenFromEmail() throws Exception {
    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    MimeMessage[] messages = GREEN_MAIL.getReceivedMessages();
    Matcher matcher =
        LINK_TOKEN.matcher(String.valueOf(messages[messages.length - 1].getContent()));
    assertThat(matcher.find()).as("o e-mail deve conter o link com o token").isTrue();
    return matcher.group(1);
  }

  private int confirm(String token, String newPassword) throws Exception {
    return mockMvc
        .perform(
            post("/auth/password-reset/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("token", token, "newPassword", newPassword))))
        .andReturn()
        .getResponse()
        .getStatus();
  }

  @Test
  void enviaOLinkPorEmailParaContaExistenteEResponde202() throws Exception {
    users.registerAndLogin("ana@example.com");

    mockMvc
        .perform(
            post("/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", "ana@example.com"))))
        .andExpect(status().isAccepted())
        .andExpect(matchesContract());

    assertThat(lastTokenFromEmail()).hasSizeGreaterThan(30);
    MimeMessage message = GREEN_MAIL.getReceivedMessages()[0];
    assertThat(message.getAllRecipients()[0].toString()).isEqualTo("ana@example.com");
    assertThat(String.valueOf(message.getContent()))
        .contains("http://localhost:4200/reset-password");
  }

  @Test
  void contaInexistenteRecebeAMesmaRespostaSemEnviarEmail() throws Exception {
    requestReset("ninguem@example.com", 202);

    assertThat(GREEN_MAIL.waitForIncomingEmail(500, 1)).isFalse();
  }

  @Test
  void guardaSomenteOHashDoTokenNoBanco() throws Exception {
    users.registerAndLogin("ana@example.com");
    requestReset("ana@example.com", 202);
    String token = lastTokenFromEmail();

    String stored =
        jdbc.queryForObject("SELECT token_hash FROM password_reset_tokens", String.class);

    assertThat(stored).hasSize(64).isNotEqualTo(token);
  }

  @Test
  void confirmaTrocaASenhaEncerraSessoesAnterioresNaHoraEInutilizaOLink() throws Exception {
    TestUser ana = users.registerAndLogin("ana@example.com");
    String oldRefresh =
        users.login("ana@example.com", TestUsers.PASSWORD).get("refreshToken").asText();
    requestReset("ana@example.com", 202);
    String token = lastTokenFromEmail();

    mockMvc
        .perform(
            post("/auth/password-reset/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("token", token, "newPassword", "nova-senha-segura-456"))))
        .andExpect(status().isNoContent())
        .andExpect(matchesContract());

    // senha nova funciona, a antiga não
    assertThat(users.login("ana@example.com", "nova-senha-segura-456").get("accessToken").asText())
        .isNotBlank();
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("email", "ana@example.com", "password", TestUsers.PASSWORD))))
        .andExpect(status().isUnauthorized());
    // token de acesso emitido antes da troca é recusado já na requisição seguinte
    mockMvc
        .perform(post("/auth/logout").header(HttpHeaders.AUTHORIZATION, ana.bearer()))
        .andExpect(status().isUnauthorized());
    // refresh token anterior foi revogado
    mockMvc
        .perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("refreshToken", oldRefresh))))
        .andExpect(status().isUnauthorized());
    // o link é de uso único
    mockMvc
        .perform(
            post("/auth/password-reset/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("token", token, "newPassword", "outra-senha-segura-789"))))
        .andExpect(status().isBadRequest())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("INVALID_RESET_TOKEN"));
  }

  @Test
  void linkExpiraEmSessentaMinutos() throws Exception {
    users.registerAndLogin("ana@example.com");
    requestReset("ana@example.com", 202);
    String token = lastTokenFromEmail();

    clock.advance(Duration.ofMinutes(59));
    assertThat(confirm(token, "nova-senha-segura-456")).isEqualTo(204);

    users.registerAndLogin("bia@example.com");
    GREEN_MAIL.purgeEmailFromAllMailboxes();
    requestReset("bia@example.com", 202);
    String biaToken = lastTokenFromEmail();
    clock.advance(Duration.ofMinutes(61));
    assertThat(confirm(biaToken, "nova-senha-segura-456")).isEqualTo(400);
  }

  @Test
  void novaSolicitacaoInvalidaOLinkAnterior() throws Exception {
    users.registerAndLogin("ana@example.com");
    requestReset("ana@example.com", 202);
    String first = lastTokenFromEmail();
    GREEN_MAIL.purgeEmailFromAllMailboxes();
    requestReset("ana@example.com", 202);
    String second = lastTokenFromEmail();

    assertThat(second).isNotEqualTo(first);
    assertThat(confirm(first, "nova-senha-segura-456")).isEqualTo(400);
    assertThat(confirm(second, "nova-senha-segura-456")).isEqualTo(204);
  }

  @Test
  void senhaFracaNaConfirmacaoRetorna422EMantemOLinkValido() throws Exception {
    users.registerAndLogin("ana@example.com");
    requestReset("ana@example.com", 202);
    String token = lastTokenFromEmail();

    assertThat(confirm(token, "curta")).isEqualTo(422);
    assertThat(confirm(token, "nova-senha-segura-456")).isEqualTo(204);
  }

  @Test
  void limitaATresSolicitacoesPorHoraPorEmailInclusiveParaContaInexistente() throws Exception {
    users.registerAndLogin("ana@example.com");

    for (String email : new String[] {"ana@example.com", "ninguem@example.com"}) {
      for (int i = 0; i < 3; i++) {
        requestReset(email, 202);
      }
      mockMvc
          .perform(
              post("/auth/password-reset/request")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(Map.of("email", email))))
          .andExpect(status().isTooManyRequests())
          .andExpect(matchesContract())
          .andExpect(header().exists("Retry-After"))
          .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"));
    }

    clock.advance(Duration.ofHours(1).plusSeconds(1));
    requestReset("ana@example.com", 202);
  }
}
