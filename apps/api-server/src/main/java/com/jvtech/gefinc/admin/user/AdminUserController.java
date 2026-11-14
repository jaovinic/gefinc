package com.jvtech.gefinc.admin.user;

import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.common.Destructive;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.RoleChangeRequest;
import com.jvtech.gefinc.user.UserRole;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Operações do painel sobre usuários. Exclusivo de administradores. */
@RestController
@RequestMapping("/admin/users")
@AdminOnly
public class AdminUserController {

  private final AdminRoleService roles;

  public AdminUserController(AdminRoleService roles) {
    this.roles = roles;
  }

  /** Concede ou retira o perfil de administrador. Destrutivo: cota própria de ações destrutivas. */
  @Destructive
  @PutMapping("/{userId}/role")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void changeRole(
      @PathVariable("userId") long userId, @Valid @RequestBody RoleChangeRequest body) {
    roles.change(userId, UserRole.valueOf(body.role()), body.password());
  }
}
