package com.jvtech.gefinc.transaction;

import com.jvtech.gefinc.category.CategoryType;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.transaction.TransactionDtos.Patch;
import com.jvtech.gefinc.transaction.TransactionDtos.PayRequest;
import com.jvtech.gefinc.transaction.TransactionDtos.TransactionPage;
import com.jvtech.gefinc.transaction.TransactionDtos.TransactionResponse;
import jakarta.validation.Valid;
import java.time.YearMonth;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/transactions")
public class TransactionController {

  private final TransactionService service;

  public TransactionController(TransactionService service) {
    this.service = service;
  }

  @GetMapping
  public TransactionPage list(
      @RequestParam(required = false) YearMonth month,
      @RequestParam(required = false) Long accountId,
      @RequestParam(required = false) Long categoryId,
      @RequestParam(required = false) CategoryType kind,
      @RequestParam(required = false) RecurrenceType recurrenceType,
      @RequestParam(required = false) TransactionStatus status,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size) {
    var filter =
        new TransactionSearch.Filter(month, accountId, categoryId, kind, recurrenceType, status);
    return service.list(CurrentUser.id(), filter, page, size);
  }

  @GetMapping("/{id}")
  public TransactionResponse get(@PathVariable long id) {
    return service.get(CurrentUser.id(), id);
  }

  @PatchMapping("/{id}")
  public TransactionResponse patch(@PathVariable long id, @Valid @RequestBody Patch body) {
    return service.patch(CurrentUser.id(), id, body);
  }

  @PostMapping("/{id}/pay")
  public TransactionResponse pay(@PathVariable long id, @Valid @RequestBody PayRequest body) {
    return service.pay(CurrentUser.id(), id, body.paymentDate());
  }

  @PostMapping("/{id}/unpay")
  public TransactionResponse unpay(@PathVariable long id) {
    return service.unpay(CurrentUser.id(), id);
  }
}
