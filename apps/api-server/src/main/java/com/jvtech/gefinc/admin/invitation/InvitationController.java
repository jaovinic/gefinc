package com.jvtech.gefinc.admin.invitation;

import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.invitation.InvitationDtos.InvitationRequest;
import com.jvtech.gefinc.admin.invitation.InvitationDtos.InvitationView;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Gerenciamento de convites de cadastro pelo painel administrativo. */
@RestController
@RequestMapping("/admin/invitations")
@AdminOnly
public class InvitationController {

  private final InvitationService service;

  public InvitationController(InvitationService service) {
    this.service = service;
  }

  @GetMapping
  public List<InvitationView> list(@RequestParam(name = "status", required = false) String status) {
    return service.list(status);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public InvitationView create(@Valid @RequestBody InvitationRequest body) {
    return service.createOrResend(body.email());
  }

  @PostMapping("/{id}/resend")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public void resend(@PathVariable("id") long id) {
    service.resend(id);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void cancel(@PathVariable("id") long id) {
    service.cancel(id);
  }
}
