package com.jvtech.gefinc.common.error;

public class MaintenanceException extends ApiException {

  public MaintenanceException(String message) {
    super(
        ErrorCode.MAINTENANCE,
        message != null && !message.isBlank()
            ? message
            : "Sistema em manutenção. Tente novamente mais tarde.");
    with("message", message != null ? message : "");
  }
}
