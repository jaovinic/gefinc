package com.jvtech.gefinc.admin.user;

import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.common.Destructive;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminUserDetail;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminUserPage;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.RoleChangeRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Leitura e operações do painel sobre usuários. Exclusivo de administradores. */
@RestController
@RequestMapping("/admin/users")
@AdminOnly
public class AdminUserController {

  private final AdminRoleService roles;
  private final AdminUserService users;

  public AdminUserController(AdminRoleService roles, AdminUserService users) {
    this.roles = roles;
    this.users = users;
  }

  /**
   * Lista paginada, sem dado financeiro. Não é auditada. Parâmetros fora do contrato dão {@code
   * 422}.
   */
  @GetMapping
  public AdminUserPage list(
      @RequestParam(name = "q", required = false) String q,
      @RequestParam(name = "status", required = false) String status,
      @RequestParam(name = "sort", required = false) String sort,
      @RequestParam(name = "dir", required = false) String dir,
      @RequestParam(name = "page", required = false) Integer page,
      @RequestParam(name = "size", required = false) Integer size) {
    return users.list(q, status, sort, dir, page, size);
  }

  /** Detalhe de um usuário. Cada abertura é auditada ({@code USER_DETAIL_OPENED}). */
  @GetMapping("/{userId}")
  public AdminUserDetail detail(@PathVariable("userId") long userId) {
    return users.detail(userId);
  }

  /** Concede ou retira o perfil de administrador. Destrutivo: cota própria de ações destrutivas. */
  @Destructive
  @PutMapping("/{userId}/role")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void changeRole(@PathVariable("userId") long userId, @RequestBody RoleChangeRequest body) {
    roles.change(userId, body.role(), body.password());
  }
}
