package com.jvtech.gefinc.admin.deletion;

import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.common.Destructive;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.DeletionOutcome;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.DeletionRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/users/{userId}/deletion")
@AdminOnly
public class DeletionController {

  private final DeletionRequestService service;

  public DeletionController(DeletionRequestService service) {
    this.service = service;
  }

  @PostMapping
  @Destructive
  public DeletionOutcome requestDeletion(
      @PathVariable("userId") long userId, @RequestBody DeletionRequest request) {
    return service.requestDeletion(userId, request);
  }

  @DeleteMapping
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void cancelDeletion(@PathVariable("userId") long userId) {
    service.cancelDeletion(userId);
  }
}
