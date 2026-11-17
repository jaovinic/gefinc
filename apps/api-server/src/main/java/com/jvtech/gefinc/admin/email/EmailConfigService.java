package com.jvtech.gefinc.admin.email;

import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.common.config.AppProperties;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.mail.DeliveryMode;
import com.jvtech.gefinc.common.mail.MailKind;
import com.jvtech.gefinc.common.mail.MailOutcome;
import com.jvtech.gefinc.common.mail.MailService;
import com.jvtech.gefinc.common.mail.MailTemplates;
import com.jvtech.gefinc.common.mail.OutgoingMail;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.user.UserRepository;
import java.util.Map;
import java.util.Properties;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Service;

/**
 * Configuração de envio de e-mail e e-mail de teste. A configuração devolvida nunca carrega usuário
 * nem senha do SMTP. O teste vai sempre ao e-mail do administrador autenticado (nunca de
 * parâmetro), em uma única tentativa ({@code SYNC_ONCE}); a thread aguarda o servidor de e-mail
 * pelos tempos-limite configurados. Falha de envio não é erro HTTP: devolve {@code FAILED} com a
 * causa categorizada.
 */
@Service
public class EmailConfigService {

  private final JavaMailSender sender;
  private final AppProperties properties;
  private final MailService mail;
  private final UserRepository users;
  private final AdminActionExecutor executor;

  public EmailConfigService(
      JavaMailSender sender,
      AppProperties properties,
      MailService mail,
      UserRepository users,
      AdminActionExecutor executor) {
    this.sender = sender;
    this.properties = properties;
    this.mail = mail;
    this.users = users;
    this.executor = executor;
  }

  public EmailConfigView config() {
    String host = "";
    int port = 0;
    boolean auth = false;
    boolean starttls = false;
    if (sender instanceof JavaMailSenderImpl impl) {
      host = impl.getHost() == null ? "" : impl.getHost();
      port = impl.getPort();
      Properties smtp = impl.getJavaMailProperties();
      auth = Boolean.parseBoolean(smtp.getProperty("mail.smtp.auth"));
      starttls = Boolean.parseBoolean(smtp.getProperty("mail.smtp.starttls.enable"));
    }
    String from = properties.mailFrom() == null ? "" : properties.mailFrom();
    return new EmailConfigView(host, port, from, mail.isConfigured(), auth, starttls);
  }

  public EmailTestResultView sendTest() {
    long adminId = CurrentUser.id();
    return executor.run(
        new AuditContext(AuditAction.EMAIL_TEST_SENT, null, null, null, null),
        () -> {
          String email =
              users
                  .findById(adminId)
                  .orElseThrow(
                      () -> new ApiException(ErrorCode.NOT_FOUND, "Usuário não encontrado."))
                  .getEmail();
          MailOutcome outcome =
              mail.send(
                  new OutgoingMail(
                      MailKind.TEST,
                      email,
                      "GEFINC: e-mail de teste",
                      MailTemplates.render("test", Map.of()),
                      adminId),
                  DeliveryMode.SYNC_ONCE);
          return outcome.sent()
              ? new EmailTestResultView("SENT", null)
              : new EmailTestResultView("FAILED", outcome.reason());
        });
  }
}
