package com.jvtech.gefinc.transfer;

import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.transfer.TransferDtos.TransferInput;
import com.jvtech.gefinc.transfer.TransferDtos.TransferPage;
import com.jvtech.gefinc.transfer.TransferDtos.TransferResponse;
import com.jvtech.gefinc.transfer.TransferDtos.TransferUpdate;
import jakarta.validation.Valid;
import java.time.YearMonth;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/transfers")
public class TransferController {

  private final TransferService service;

  public TransferController(TransferService service) {
    this.service = service;
  }

  @GetMapping
  public TransferPage list(
      @RequestParam YearMonth month,
      @RequestParam(required = false) Long accountId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size) {
    return service.list(CurrentUser.id(), month, accountId, page, size);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public TransferResponse create(@Valid @RequestBody TransferInput body) {
    return service.create(CurrentUser.id(), body);
  }

  @GetMapping("/{id}")
  public TransferResponse get(@PathVariable long id) {
    return service.get(CurrentUser.id(), id);
  }

  @PutMapping("/{id}")
  public TransferResponse update(@PathVariable long id, @Valid @RequestBody TransferUpdate body) {
    return service.update(CurrentUser.id(), id, body);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable long id) {
    service.delete(CurrentUser.id(), id);
  }
}
