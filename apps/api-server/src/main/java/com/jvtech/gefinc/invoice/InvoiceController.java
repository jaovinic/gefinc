package com.jvtech.gefinc.invoice;

import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.invoice.InvoiceDtos.InvoiceResponse;
import com.jvtech.gefinc.invoice.InvoiceDtos.PaymentInput;
import com.jvtech.gefinc.invoice.InvoiceDtos.ProjectionResponse;
import com.jvtech.gefinc.invoice.InvoiceDtos.SettleRequest;
import jakarta.validation.Valid;
import java.time.YearMonth;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class InvoiceController {

  private final InvoiceService invoices;
  private final InvoicePaymentService paymentService;

  public InvoiceController(InvoiceService invoices, InvoicePaymentService paymentService) {
    this.invoices = invoices;
    this.paymentService = paymentService;
  }

  @GetMapping("/accounts/{accountId}/invoices/{month}")
  public InvoiceResponse get(@PathVariable long accountId, @PathVariable YearMonth month) {
    return invoices.invoice(CurrentUser.id(), accountId, month);
  }

  @PostMapping("/accounts/{accountId}/invoices/{month}/payments")
  @ResponseStatus(HttpStatus.CREATED)
  public InvoiceResponse pay(
      @PathVariable long accountId,
      @PathVariable YearMonth month,
      @Valid @RequestBody PaymentInput body) {
    return paymentService.pay(CurrentUser.id(), accountId, month, body.amount(), body.paidAt());
  }

  @PostMapping("/accounts/{accountId}/invoices/{month}/payments/settle")
  @ResponseStatus(HttpStatus.CREATED)
  public InvoiceResponse settle(
      @PathVariable long accountId,
      @PathVariable YearMonth month,
      @Valid @RequestBody SettleRequest body) {
    return paymentService.settle(CurrentUser.id(), accountId, month, body.paidAt());
  }

  @DeleteMapping("/invoice-payments/{paymentId}")
  public InvoiceResponse undo(@PathVariable long paymentId) {
    return paymentService.undo(CurrentUser.id(), paymentId);
  }

  @GetMapping("/invoices/projection")
  public ProjectionResponse projection(
      @RequestParam YearMonth from,
      @RequestParam(defaultValue = "12") int months,
      @RequestParam(required = false) Long accountId) {
    return invoices.projection(CurrentUser.id(), from, months, accountId);
  }
}
