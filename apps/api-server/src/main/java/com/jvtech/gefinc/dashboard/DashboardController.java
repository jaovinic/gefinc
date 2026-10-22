package com.jvtech.gefinc.dashboard;

import com.jvtech.gefinc.common.security.CurrentUser;
import java.time.YearMonth;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DashboardController {

  private final DashboardService service;

  public DashboardController(DashboardService service) {
    this.service = service;
  }

  @GetMapping("/dashboard")
  public DashboardService.Dashboard dashboard(@RequestParam YearMonth month) {
    return service.dashboard(CurrentUser.id(), month);
  }
}
