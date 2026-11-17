package com.jvtech.gefinc.admin.deletion;

import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.PendingCommunicationView;
import com.jvtech.gefinc.admin.deletion.DeletionDtos.ResendResult;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/communications/pending")
@AdminOnly
public class PendingCommunicationController {

  private final PendingCommunicationService service;

  public PendingCommunicationController(PendingCommunicationService service) {
    this.service = service;
  }

  @GetMapping
  public List<PendingCommunicationView> list() {
    return service.listPending();
  }

  @PostMapping("/{id}/resend")
  public ResendResult resend(@PathVariable("id") long id) {
    return service.resend(id);
  }

  @PostMapping("/{id}/discard")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void discard(@PathVariable("id") long id) {
    service.discard(id);
  }
}
