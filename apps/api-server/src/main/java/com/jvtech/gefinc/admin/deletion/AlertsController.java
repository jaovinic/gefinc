package com.jvtech.gefinc.admin.deletion;

import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.AdminAlerts;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/alerts")
@AdminOnly
public class AlertsController {

  private final PendingCommunicationService service;

  public AlertsController(PendingCommunicationService service) {
    this.service = service;
  }

  @GetMapping
  public AdminAlerts getAlerts() {
    return new AdminAlerts(service.countPending());
  }
}
