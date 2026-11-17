package com.jvtech.gefinc.admin.email;

import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.user.AdminPasswordResetService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
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

  public EmailAdminController(AdminPasswordResetService passwordReset) {
    this.passwordReset = passwordReset;
  }

  /** Reenvia uma redefinição de senha que falhou, gerando um novo link. */
  @PostMapping("/deliveries/{deliveryId}/resend")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public void resendDelivery(@PathVariable("deliveryId") long deliveryId) {
    passwordReset.resendFailedDelivery(deliveryId);
  }
}
