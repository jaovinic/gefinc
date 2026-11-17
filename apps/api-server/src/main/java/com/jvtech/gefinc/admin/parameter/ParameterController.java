package com.jvtech.gefinc.admin.parameter;

import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.parameter.ParameterDtos.MaintenanceRequest;
import com.jvtech.gefinc.admin.parameter.ParameterDtos.ParametersView;
import com.jvtech.gefinc.admin.parameter.ParameterDtos.SignupsOpenRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Consulta e alteração de parâmetros do sistema no painel administrativo. */
@AdminOnly
@RestController
@RequestMapping("/admin/parameters")
public class ParameterController {

  private final SystemParameterService service;

  public ParameterController(SystemParameterService service) {
    this.service = service;
  }

  @GetMapping
  public ParametersView getParameters() {
    return service.getParameters();
  }

  @PutMapping("/signups-open")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void setSignupsOpen(@Valid @RequestBody SignupsOpenRequest request) {
    service.setSignupsOpen(request.open());
  }

  @PutMapping("/maintenance")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void setMaintenance(@Valid @RequestBody MaintenanceRequest request) {
    service.setMaintenance(request.enabled(), request.message());
  }
}
