package com.jvtech.gefinc.account;

import com.jvtech.gefinc.account.AccountDtos.AccountInput;
import com.jvtech.gefinc.account.AccountDtos.AccountResponse;
import com.jvtech.gefinc.account.AccountDtos.AccountUpdate;
import com.jvtech.gefinc.account.AccountDtos.AccountUsage;
import com.jvtech.gefinc.common.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
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
@RequestMapping("/accounts")
public class AccountController {

  private final AccountService service;

  public AccountController(AccountService service) {
    this.service = service;
  }

  @GetMapping
  public List<AccountResponse> list(@RequestParam(defaultValue = "false") boolean includeInactive) {
    long userId = CurrentUser.id();
    return service.responses(userId, service.list(userId, includeInactive));
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public AccountResponse create(@Valid @RequestBody AccountInput body) {
    long userId = CurrentUser.id();
    return service.response(userId, service.create(userId, body));
  }

  @GetMapping("/{id}")
  public AccountResponse get(@PathVariable("id") long id) {
    long userId = CurrentUser.id();
    return service.response(userId, service.get(userId, id));
  }

  @GetMapping("/{id}/usage")
  public AccountUsage usage(@PathVariable("id") long id) {
    return service.usage(CurrentUser.id(), id);
  }

  @PutMapping("/{id}")
  public AccountResponse update(
      @PathVariable("id") long id, @Valid @RequestBody AccountUpdate body) {
    long userId = CurrentUser.id();
    return service.response(userId, service.update(userId, id, body));
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable("id") long id) {
    service.delete(CurrentUser.id(), id);
  }
}
