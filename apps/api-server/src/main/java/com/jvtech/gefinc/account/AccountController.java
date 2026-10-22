package com.jvtech.gefinc.account;

import com.jvtech.gefinc.account.AccountDtos.AccountInput;
import com.jvtech.gefinc.account.AccountDtos.AccountResponse;
import com.jvtech.gefinc.account.AccountDtos.AccountUpdate;
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
    return service.list(CurrentUser.id(), includeInactive).stream()
        .map(AccountResponse::of)
        .toList();
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public AccountResponse create(@Valid @RequestBody AccountInput body) {
    return AccountResponse.of(service.create(CurrentUser.id(), body));
  }

  @GetMapping("/{id}")
  public AccountResponse get(@PathVariable long id) {
    return AccountResponse.of(service.get(CurrentUser.id(), id));
  }

  @PutMapping("/{id}")
  public AccountResponse update(@PathVariable long id, @Valid @RequestBody AccountUpdate body) {
    return AccountResponse.of(service.update(CurrentUser.id(), id, body));
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable long id) {
    service.delete(CurrentUser.id(), id);
  }
}
