package com.jvtech.gefinc.admin.parameter;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.error.MaintenanceException;
import org.springframework.stereotype.Component;

/** Guarda central para verificação do estado de manutenção e abertura de cadastros. */
@Component
public class MaintenanceGuard {

  private final SystemParameterService parameterService;

  public MaintenanceGuard(SystemParameterService parameterService) {
    this.parameterService = parameterService;
  }

  public boolean isMaintenanceActive() {
    return parameterService.isMaintenanceEnabled();
  }

  public String getMaintenanceMessage() {
    return parameterService.getMaintenanceMessage();
  }

  public boolean isSignupsOpen() {
    return parameterService.isSignupsOpen();
  }

  public void checkMaintenance() {
    if (isMaintenanceActive()) {
      throw new MaintenanceException(getMaintenanceMessage());
    }
  }

  public void checkSignupsOpen() {
    if (!isSignupsOpen()) {
      throw new ApiException(
          ErrorCode.SIGNUPS_CLOSED, "Novos cadastros estão temporariamente fechados.");
    }
  }
}
