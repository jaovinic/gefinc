package com.jvtech.gefinc.admin.user;

import com.jvtech.gefinc.admin.common.AdminOnly;
import com.jvtech.gefinc.admin.common.Destructive;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminSession;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminUserDetail;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminUserPage;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.EmailChangeConfirmRequest;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.EmailChangeRequest;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.ForcePasswordResetRequest;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.PendingEmailChangeView;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.RoleChangeRequest;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.SuspendRequest;
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

/** Leitura e operações do painel sobre usuários. Exclusivo de administradores. */
@RestController
@RequestMapping("/admin/users")
@AdminOnly
public class AdminUserController {

  private final AdminRoleService roles;
  private final AdminUserService users;
  private final AdminAccountService accounts;
  private final SessionAdmin sessions;
  private final AdminPasswordResetService passwordReset;
  private final EmailChangeService emailChanges;

  public AdminUserController(
      AdminRoleService roles,
      AdminUserService users,
      AdminAccountService accounts,
      SessionAdmin sessions,
      AdminPasswordResetService passwordReset,
      EmailChangeService emailChanges) {
    this.roles = roles;
    this.users = users;
    this.accounts = accounts;
    this.sessions = sessions;
    this.passwordReset = passwordReset;
    this.emailChanges = emailChanges;
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

  /** Sessões abertas do usuário, com IP e dispositivo (dado pessoal). */
  @GetMapping("/{userId}/sessions")
  public List<AdminSession> sessions(@PathVariable("userId") long userId) {
    return sessions.list(userId);
  }

  /** Encerra todas as sessões do usuário, valendo na requisição seguinte. */
  @Destructive
  @DeleteMapping("/{userId}/sessions")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void revokeAllSessions(@PathVariable("userId") long userId) {
    sessions.revokeAll(userId);
  }

  /** Encerra uma sessão do usuário. */
  @Destructive
  @DeleteMapping("/{userId}/sessions/{sessionId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void revokeSession(
      @PathVariable("userId") long userId, @PathVariable("sessionId") String sessionId) {
    sessions.revokeOne(userId, sessionId);
  }

  /** Suspende a conta. O motivo vai só para a auditoria. */
  @Destructive
  @PostMapping("/{userId}/suspend")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void suspend(@PathVariable("userId") long userId, @RequestBody SuspendRequest body) {
    accounts.suspend(userId, body.reason());
  }

  /** Reativa a conta suspensa (a exclusão pendente, se houver, continua). */
  @PostMapping("/{userId}/reactivate")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void reactivate(@PathVariable("userId") long userId) {
    accounts.reactivate(userId);
  }

  /** Retira o bloqueio temporário por tentativas de login. */
  @DeleteMapping("/{userId}/login-lock")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void clearLoginLock(@PathVariable("userId") long userId) {
    accounts.clearLoginLock(userId);
  }

  /** Reenvia o e-mail de redefinição de senha (invalida links anteriores). */
  @PostMapping("/{userId}/password-reset/send")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public void sendPasswordReset(@PathVariable("userId") long userId) {
    passwordReset.send(userId);
  }

  /** Invalida a senha e as sessões e envia o link de redefinição (exige a senha do admin). */
  @Destructive
  @PostMapping("/{userId}/password-reset/force")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public void forcePasswordReset(
      @PathVariable("userId") long userId,
      @RequestBody(required = false) ForcePasswordResetRequest body) {
    passwordReset.force(userId, body == null ? null : body.password());
  }

  /**
   * Solicita a troca de e-mail do usuário enviando o código de confirmação ao novo endereço. Não
   * exige reautenticação por senha (FR-035).
   */
  @PostMapping("/{userId}/email-change")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public PendingEmailChangeView requestEmailChange(
      @PathVariable("userId") long userId, @Valid @RequestBody EmailChangeRequest body) {
    return emailChanges.request(userId, body.newEmail());
  }

  /**
   * Confirma a troca de e-mail digitando o código numérico de 6 dígitos recebido pelo novo titular.
   * Não exige reautenticação por senha (FR-035).
   */
  @PostMapping("/{userId}/email-change/confirm")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void confirmEmailChange(
      @PathVariable("userId") long userId, @Valid @RequestBody EmailChangeConfirmRequest body) {
    emailChanges.confirm(userId, body.code());
  }

  /** Cancela a troca de e-mail pendente do usuário. */
  @DeleteMapping("/{userId}/email-change")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void cancelEmailChange(@PathVariable("userId") long userId) {
    emailChanges.cancel(userId);
  }
}
