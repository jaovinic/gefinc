package com.jvtech.gefinc.admin.parameter;

import com.jvtech.gefinc.admin.parameter.ParameterDtos.SystemStatusResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consulta pública de estado do sistema (modo de manutenção e abertura de cadastros). Rota pública
 * e sem nenhum dado sensível.
 */
@RestController
@RequestMapping("/system/status")
public class SystemStatusController {

  private final MaintenanceGuard guard;

  public SystemStatusController(MaintenanceGuard guard) {
    this.guard = guard;
  }

  @GetMapping
  public SystemStatusResponse getStatus() {
    boolean maintenance = guard.isMaintenanceActive();
    String message = maintenance ? guard.getMaintenanceMessage() : null;
    boolean signupsOpen = guard.isSignupsOpen();
    return new SystemStatusResponse(maintenance, message, signupsOpen);
  }
}
