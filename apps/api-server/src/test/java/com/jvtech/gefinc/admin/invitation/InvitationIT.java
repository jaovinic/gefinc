package com.jvtech.gefinc.admin.invitation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.auth.TokenService;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import jakarta.mail.internet.MimeMessage;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Testes de integração do fluxo de convites de cadastro (US9, T124):
 *
 * <ul>
 *   <li>Convite vale 7 dias;
 *   <li>Reenviar gera novo link e invalida o anterior;
 *   <li>Qualquer administrador reenvia ou cancela;
 *   <li>Cadastro próprio com o mesmo e-mail consome o convite;
 *   <li>Expirado responde 410 INVITATION_EXPIRED;
 *   <li>E-mail em claro só enquanto PENDING;
 *   <li>Manutenção bloqueia o aceite (503), cadastros fechados não;
 *   <li>E-mail já cadastrado responde 409 EMAIL_ALREADY_REGISTERED;
 *   <li>Falha de envio não cria o convite (502);
 *   <li>Endpoints públicos GET /auth/invitations/{token} e POST .../accept com política de senha.
 * </ul>
 */
class InvitationIT extends IntegrationTestBase {

  private static final Pattern TOKEN_PATTERN = Pattern.compile("/invitations/([A-Za-z0-9_-]+)");

  @Autowired private Pseudonymizer pseudonymizer;

  private TestUsers users;
  private SeededUser adminRow;
  private TestUser admin;
  private SeededUser admin2Row;
  private TestUser admin2;

  @BeforeEach
  void init() throws Exception {
    users = new TestUsers(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm1@example.com");
    admin =
        new TestUser(
            adminRow.id(),
            "adm1@example.com",
            users.login("adm1@example.com", TestUsers.PASSWORD).get("accessToken").asText());

    admin2Row = seed.createAdmin("adm2@example.com");
    admin2 =
        new TestUser(
            admin2Row.id(),
            "adm2@example.com",
            users.login("adm2@example.com", TestUsers.PASSWORD).get("accessToken").asText());

    GREEN_MAIL.purgeEmailFromAllMailboxes();
  }

  private String extractToken(MimeMessage message) throws Exception {
    String content = String.valueOf(message.getContent()).replace("=\r\n", "").replace("=\n", "");
    Matcher matcher = TOKEN_PATTERN.matcher(content);
    if (matcher.find()) {
      return matcher.group(1);
    }
    throw new IllegalStateException("Token não encontrado no e-mail: " + content);
  }

  @Test
  void conviteValeSeteDiasECriaNaSituacaoPendingComAuditoriaEEmail() throws Exception {
    String email = "convidado@teste.com";
    Instant before = clock.instant();

    mockMvc
        .perform(
            post("/admin/invitations")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").isNumber())
        .andExpect(jsonPath("$.email").value(email))
        .andExpect(jsonPath("$.status").value("PENDING"))
        .andExpect(jsonPath("$.invitedBy.userId").value(adminRow.id()))
        .andExpect(jsonPath("$.invitedBy.label").value("adm1@example.com"))
        .andExpect(jsonPath("$.createdAt").isNotEmpty())
        .andExpect(jsonPath("$.expiresAt").isNotEmpty());

    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    MimeMessage[] messages = GREEN_MAIL.getReceivedMessages();
    MimeMessage message = messages[messages.length - 1];
    assertThat(message.getAllRecipients()[0].toString()).isEqualTo(email);
    String token = extractToken(message);

    // Valida no banco
    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM invitations WHERE email = ?", email);
    assertThat(row.get("token_hash")).isEqualTo(TokenService.hash(token));
    assertThat(row.get("status")).isEqualTo("PENDING");
    assertThat(row.get("email_ref")).isEqualTo(pseudonymizer.emailRef(email));

    Instant expiresAt = ((java.sql.Timestamp) row.get("expires_at")).toInstant();
    assertThat(Duration.between(before, expiresAt).toDays()).isEqualTo(7);

    // Auditoria
    Map<String, Object> audit =
        jdbc.queryForMap("SELECT * FROM audit_log WHERE action = 'INVITATION_CREATED'");
    assertThat(audit.get("result")).isEqualTo("SUCCESS");
    assertThat(audit.get("actor_user_id")).isEqualTo(adminRow.id());
    assertThat(audit.get("subject")).isEqualTo(String.valueOf(row.get("id")));

    // Consulta pública antes de aceitar
    mockMvc
        .perform(get("/auth/invitations/" + token))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.email").value(email))
        .andExpect(jsonPath("$.expiresAt").isNotEmpty());
  }

  @Test
  void reenviarGeraNovoLinkEInvalidaOAnterior() throws Exception {
    String email = "reenvio@teste.com";

    // 1. Cria convite
    mockMvc
        .perform(
            post("/admin/invitations")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
        .andExpect(status().isCreated());

    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    MimeMessage[] msgs1 = GREEN_MAIL.getReceivedMessages();
    String token1 = extractToken(msgs1[msgs1.length - 1]);
    GREEN_MAIL.purgeEmailFromAllMailboxes();

    // 2. Reconvidar o mesmo e-mail reenvia automaticamente
    mockMvc
        .perform(
            post("/admin/invitations")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.status").value("PENDING"));

    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    MimeMessage[] msgs2 = GREEN_MAIL.getReceivedMessages();
    String token2 = extractToken(msgs2[msgs2.length - 1]);
    assertThat(token2).isNotEqualTo(token1);

    // Token anterior agora responde 404 (já não existe na base)
    mockMvc.perform(get("/auth/invitations/" + token1)).andExpect(status().isNotFound());

    // Novo token responde 200
    mockMvc.perform(get("/auth/invitations/" + token2)).andExpect(status().isOk());

    // Auditoria tem INVITATION_RESENT
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'INVITATION_RESENT'", Long.class))
        .isEqualTo(1);
  }

  @Test
  void qualquerAdministradorPodeReenviarOuCancelar() throws Exception {
    String email = "outro-adm@teste.com";

    // Admin 1 cria
    String res =
        mockMvc
            .perform(
                post("/admin/invitations")
                    .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(Map.of("email", email))))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    long invitationId = objectMapper.readTree(res).get("id").asLong();
    GREEN_MAIL.purgeEmailFromAllMailboxes();

    // Admin 2 reenvia
    mockMvc
        .perform(
            post("/admin/invitations/" + invitationId + "/resend")
                .header(HttpHeaders.AUTHORIZATION, admin2.bearer()))
        .andExpect(status().isAccepted());

    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    GREEN_MAIL.purgeEmailFromAllMailboxes();

    // Admin 2 cancela
    mockMvc
        .perform(
            delete("/admin/invitations/" + invitationId)
                .header(HttpHeaders.AUTHORIZATION, admin2.bearer()))
        .andExpect(status().isNoContent());

    Map<String, Object> row =
        jdbc.queryForMap("SELECT * FROM invitations WHERE id = ?", invitationId);
    assertThat(row.get("status")).isEqualTo("CANCELED");
    assertThat(row.get("email")).isNull();
    assertThat(row.get("resolved_at")).isNotNull();

    // Reenviar convite cancelado dá 409
    mockMvc
        .perform(
            post("/admin/invitations/" + invitationId + "/resend")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isConflict());
  }

  @Test
  void cadastroProprioComOMesmoEmailConsomeOConvite() throws Exception {
    String email = "auto-cadastro@teste.com";

    mockMvc
        .perform(
            post("/admin/invitations")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
        .andExpect(status().isCreated());

    // Usuário se cadastra por conta própria em /auth/register
    String registerBody =
        mockMvc
            .perform(
                post("/auth/register")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        objectMapper.writeValueAsString(
                            Map.of("email", email, "password", "senha-forte-12345"))))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();

    long createdUserId = objectMapper.readTree(registerBody).get("id").asLong();

    Map<String, Object> row =
        jdbc.queryForMap(
            "SELECT * FROM invitations WHERE email_ref = ?", pseudonymizer.emailRef(email));
    assertThat(row.get("status")).isEqualTo("ACCEPTED");
    assertThat(row.get("accepted_user_id")).isEqualTo(createdUserId);
    assertThat(row.get("email")).isNull();
    assertThat(row.get("resolved_at")).isNotNull();
  }

  @Test
  void conviteExpiradoResponde410() throws Exception {
    String email = "expirado@teste.com";

    mockMvc
        .perform(
            post("/admin/invitations")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
        .andExpect(status().isCreated());

    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    MimeMessage[] msgs = GREEN_MAIL.getReceivedMessages();
    String token = extractToken(msgs[msgs.length - 1]);

    // Avança 8 dias no relógio
    clock.advance(Duration.ofDays(8));

    // Consulta dá 410 INVITATION_EXPIRED
    mockMvc
        .perform(get("/auth/invitations/" + token))
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("INVITATION_EXPIRED"));

    // Tentativa de aceite também dá 410 INVITATION_EXPIRED
    mockMvc
        .perform(
            post("/auth/invitations/" + token + "/accept")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("password", "senha-forte-12345"))))
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("INVITATION_EXPIRED"));
  }

  @Test
  void emailEmClaroSoEnquantoPending() throws Exception {
    String email = "visibilidade@teste.com";

    String created =
        mockMvc
            .perform(
                post("/admin/invitations")
                    .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(Map.of("email", email))))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    long id = objectMapper.readTree(created).get("id").asLong();

    // Na lista, aparece enquanto PENDING
    mockMvc
        .perform(
            get("/admin/invitations?status=PENDING")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].email").value(email));

    // Cancela
    mockMvc
        .perform(
            delete("/admin/invitations/" + id).header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isNoContent());

    // Na lista CANCELED, o e-mail não aparece (null/omitido)
    mockMvc
        .perform(
            get("/admin/invitations?status=CANCELED")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].email").doesNotExist());
  }

  @Test
  void manutencaoBloqueiaAceiteCadastrosFechadosNao() throws Exception {
    String email = "maint-signup@teste.com";

    mockMvc
        .perform(
            post("/admin/invitations")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
        .andExpect(status().isCreated());

    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    MimeMessage[] msgs = GREEN_MAIL.getReceivedMessages();
    String token = extractToken(msgs[msgs.length - 1]);

    // 1. Fecha cadastros gerais via endpoint autenticado de parâmetros
    mockMvc
        .perform(
            put("/admin/parameters/signups-open")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("open", false))))
        .andExpect(status().isNoContent());

    // Aceite do convite AINDA FUNCIONA
    mockMvc
        .perform(
            post("/auth/invitations/" + token + "/accept")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("password", "senha-valida-10", "name", "Convidado Especial"))))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.email").value(email))
        .andExpect(jsonPath("$.name").value("Convidado Especial"));

    // 2. Novo convite com manutenção ativa
    GREEN_MAIL.purgeEmailFromAllMailboxes();
    String email2 = "maint-only@teste.com";
    mockMvc
        .perform(
            post("/admin/invitations")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email2))))
        .andExpect(status().isCreated());

    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    MimeMessage[] msgs2 = GREEN_MAIL.getReceivedMessages();
    String token2 = extractToken(msgs2[msgs2.length - 1]);

    mockMvc
        .perform(
            put("/admin/parameters/maintenance")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("enabled", true, "message", "Estamos em atualização."))))
        .andExpect(status().isNoContent());

    // Aceite sob manutenção dá 503 MAINTENANCE
    mockMvc
        .perform(
            post("/auth/invitations/" + token2 + "/accept")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("password", "senha-valida-10"))))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.code").value("MAINTENANCE"));

    // Reverte manutenção para não afetar outros testes
    mockMvc
        .perform(
            put("/admin/parameters/maintenance")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("enabled", false, "message", ""))))
        .andExpect(status().isNoContent());
    mockMvc
        .perform(
            put("/admin/parameters/signups-open")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("open", true))))
        .andExpect(status().isNoContent());
  }

  @Test
  void emailJaCadastradoResponde409() throws Exception {
    users.registerAndLogin("existente@teste.com");

    mockMvc
        .perform(
            post("/admin/invitations")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", "existente@teste.com"))))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_REGISTERED"));
  }

  @Test
  void falhaDeEnvioNaoCriaConviteEResponde502() throws Exception {
    GREEN_MAIL.stop();

    try {
      mockMvc
          .perform(
              post("/admin/invitations")
                  .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      objectMapper.writeValueAsString(Map.of("email", "falha-smtp@teste.com"))))
          .andExpect(status().isBadGateway())
          .andExpect(jsonPath("$.code").value("MAIL_DELIVERY_FAILED"));

      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM invitations WHERE email = 'falha-smtp@teste.com'",
                  Long.class))
          .isZero();

      Map<String, Object> audit =
          jdbc.queryForMap(
              "SELECT * FROM audit_log WHERE action = 'INVITATION_CREATED' AND result = 'FAILED'");
      assertThat(audit.get("refusal_code")).isEqualTo("MAIL_DELIVERY_FAILED");
    } finally {
      GREEN_MAIL.start();
    }
  }

  @Test
  void politicaDeSenhaNoAceite() throws Exception {
    String email = "senha-fraca@teste.com";

    mockMvc
        .perform(
            post("/admin/invitations")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", email))))
        .andExpect(status().isCreated());

    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    MimeMessage[] msgs = GREEN_MAIL.getReceivedMessages();
    String token = extractToken(msgs[msgs.length - 1]);

    // Senha com menos de 10 caracteres dá 422
    mockMvc
        .perform(
            post("/auth/invitations/" + token + "/accept")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("password", "curta"))))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
  }
}
