package com.jvtech.gefinc.dashboard;

import com.jvtech.gefinc.common.security.CurrentUser;
import java.time.YearMonth;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CashflowController {

  private final CashflowService service;

  public CashflowController(CashflowService service) {
    this.service = service;
  }

  @GetMapping("/cashflow")
  public List<CashflowService.Month> cashflow(
      @RequestParam YearMonth from, @RequestParam(defaultValue = "12") int months) {
    return service.cashflow(CurrentUser.id(), from, months);
  }
}
