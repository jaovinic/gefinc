package com.jvtech.gefinc.admin.email;

import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.user.AdminPasswordResetService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Operações administrativas de e-mail (US4 / US7). Hoje expõe o reenvio de uma redefinição de senha
 * que falhou no histórico ({@code POST /admin/email/deliveries/{deliveryId}/resend}).
 */
@RestController
@RequestMapping("/admin/email")
@AdminOnly
public class EmailAdminController {

  private final AdminPasswordResetService passwordReset;
  private final EmailConfigService config;
  private final EmailDeliveryQueryService deliveries;

  public EmailAdminController(
      AdminPasswordResetService passwordReset,
      EmailConfigService config,
      EmailDeliveryQueryService deliveries) {
    this.passwordReset = passwordReset;
    this.config = config;
    this.deliveries = deliveries;
  }

  /** Configuração de envio (sem usuário nem senha). */
  @GetMapping(value = "/config", produces = "application/json")
  public EmailConfigView config() {
    return config.config();
  }

  /** E-mail de teste ao próprio administrador; falha de envio também responde 200. */
  @PostMapping(value = "/test", produces = "application/json")
  public EmailTestResultView test() {
    return config.sendTest();
  }

  /** Histórico de envios dos últimos 90 dias, por cursor opaco. */
  @GetMapping(value = "/deliveries", produces = "application/json")
  public EmailDeliveryPageView list(
      @RequestParam(name = "status", required = false) String status,
      @RequestParam(name = "kind", required = false) String kind,
      @RequestParam(name = "cursor", required = false) String cursor,
      @RequestParam(name = "limit", required = false) Integer limit) {
    return deliveries.list(status, kind, cursor, limit);
  }

  /** Reenvia uma redefinição de senha que falhou, gerando um novo link. */
  @PostMapping("/deliveries/{deliveryId}/resend")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public void resendDelivery(@PathVariable("deliveryId") long deliveryId) {
    passwordReset.resendFailedDelivery(deliveryId);
  }
}
