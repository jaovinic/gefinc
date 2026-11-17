package com.jvtech.gefinc.admin.parameter;

import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.common.Destructive;
import com.jvtech.gefinc.admin.parameter.ParameterDtos.RevokeAllRequest;
import com.jvtech.gefinc.admin.parameter.ParameterDtos.RevokeAllResult;
import com.jvtech.gefinc.admin.user.SessionAdmin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Encerramento global de sessões em caso de incidente de segurança. */
@AdminOnly
@RestController
@RequestMapping("/admin/sessions")
public class GlobalSessionController {

  private final SessionAdmin sessionAdmin;

  public GlobalSessionController(SessionAdmin sessionAdmin) {
    this.sessionAdmin = sessionAdmin;
  }

  @Destructive
  @PostMapping("/revoke-all")
  public RevokeAllResult revokeAll(@RequestBody RevokeAllRequest request) {
    int revoked = sessionAdmin.revokeAllGlobal(request.password(), request.confirmWord());
    return new RevokeAllResult(revoked);
  }
}
