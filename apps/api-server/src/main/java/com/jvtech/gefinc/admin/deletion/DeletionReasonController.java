package com.jvtech.gefinc.admin.deletion;

import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.DeletionReasonInput;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.DeletionReasonView;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/deletion-reasons")
@AdminOnly
public class DeletionReasonController {

  private final DeletionReasonService service;

  public DeletionReasonController(DeletionReasonService service) {
    this.service = service;
  }

  @GetMapping
  public List<DeletionReasonView> list() {
    return service.listAll();
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public DeletionReasonView create(@RequestBody DeletionReasonInput input) {
    return service.create(input);
  }

  @PutMapping("/{id}")
  public DeletionReasonView update(
      @PathVariable("id") long id, @RequestBody DeletionReasonInput input) {
    return service.update(id, input);
  }

  @PostMapping("/{id}/deactivate")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deactivate(@PathVariable("id") long id) {
    service.deactivate(id);
  }

  @PostMapping("/{id}/activate")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void activate(@PathVariable("id") long id) {
    service.activate(id);
  }
}
