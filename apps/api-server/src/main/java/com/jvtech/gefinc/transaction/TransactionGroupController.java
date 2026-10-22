package com.jvtech.gefinc.transaction;

import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.transaction.TransactionDtos.AmountChange;
import com.jvtech.gefinc.transaction.TransactionDtos.EndRequest;
import com.jvtech.gefinc.transaction.TransactionDtos.GroupDetailResponse;
import com.jvtech.gefinc.transaction.TransactionDtos.GroupImpact;
import com.jvtech.gefinc.transaction.TransactionDtos.GroupInput;
import com.jvtech.gefinc.transaction.TransactionDtos.GroupUpdate;
import jakarta.validation.Valid;
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
@RequestMapping("/transaction-groups")
public class TransactionGroupController {

  private final TransactionGroupService service;
  private final TransactionMapper mapper;

  TransactionGroupController(TransactionGroupService service, TransactionMapper mapper) {
    this.service = service;
    this.mapper = mapper;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public GroupDetailResponse create(@Valid @RequestBody GroupInput body) {
    return detail(service.create(CurrentUser.id(), body));
  }

  @GetMapping("/{id}")
  public GroupDetailResponse get(@PathVariable long id) {
    return detail(service.get(CurrentUser.id(), id));
  }

  @PutMapping("/{id}")
  public GroupDetailResponse update(@PathVariable long id, @Valid @RequestBody GroupUpdate body) {
    return detail(service.update(CurrentUser.id(), id, body));
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable long id, @RequestParam boolean confirm) {
    service.delete(CurrentUser.id(), id, confirm);
  }

  @GetMapping("/{id}/impact")
  public GroupImpact impact(@PathVariable long id) {
    return service.impact(CurrentUser.id(), id);
  }

  @PostMapping("/{id}/amount-changes")
  public GroupDetailResponse changeAmount(
      @PathVariable long id, @Valid @RequestBody AmountChange body) {
    return detail(service.changeAmount(CurrentUser.id(), id, body));
  }

  @PostMapping("/{id}/end")
  public GroupDetailResponse end(@PathVariable long id, @Valid @RequestBody EndRequest body) {
    return detail(service.end(CurrentUser.id(), id, body.endMonth()));
  }

  private GroupDetailResponse detail(TransactionGroupService.GroupView view) {
    return mapper.toDetail(view.group(), view.transactions());
  }
}
