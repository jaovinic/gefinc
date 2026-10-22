package com.jvtech.gefinc.dashboard;

import com.jvtech.gefinc.common.security.CurrentUser;
import java.time.LocalDate;
import java.time.YearMonth;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DashboardController {

  private final DashboardService service;
  private final DueSummaryService dueSummary;

  public DashboardController(DashboardService service, DueSummaryService dueSummary) {
    this.service = service;
    this.dueSummary = dueSummary;
  }

  @GetMapping("/dashboard")
  public DashboardService.Dashboard dashboard(@RequestParam YearMonth month) {
    return service.dashboard(CurrentUser.id(), month);
  }

  @GetMapping("/due-summary")
  public DueSummaryService.DueSummary dueSummary(
      @RequestParam LocalDate from, @RequestParam LocalDate to) {
    return dueSummary.summary(CurrentUser.id(), from, to);
  }
}
