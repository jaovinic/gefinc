package com.jvtech.gefinc.admin.user;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.jvtech.gefinc.admin.audit.AuditEntryView;
import com.jvtech.gefinc.user.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Corpos das operações de perfil e política sobre usuários (módulo administrativo) e as respostas
 * de leitura da lista e do detalhe. Nenhuma resposta tem dado financeiro nem IP; o {@code toString}
 * de cada uma não imprime e-mail nem nome.
 */
public final class UserPolicyDtos {

  private UserPolicyDtos() {}

  /**
   * Pedido de troca de perfil. {@code role} só vale {@code USER} ou {@code ADMIN} (o raiz não se
   * concede pelo painel); o valor é validado dentro da ação auditada ({@code AdminRoleService}),
   * não por Bean Validation, para que a recusa 422 também entre na trilha. A senha é a do próprio
   * administrador; ausente ou errada dá {@code REAUTH_FAILED}, não erro de validação.
   */
  public record RoleChangeRequest(String role, String password) {

    /** Sem senha em logs. */
    @Override
    public String toString() {
      return "RoleChangeRequest[REDACTED]";
    }
  }

  /**
   * Pedido de redefinição forçada de senha. Exige a senha do próprio administrador ({@code
   * REAUTH_FAILED} se ausente ou errada).
   */
  public record ForcePasswordResetRequest(String password) {

    /** Sem senha em logs. */
    @Override
    public String toString() {
      return "ForcePasswordResetRequest[REDACTED]";
    }
  }

  /**
   * Pedido de suspensão. O motivo (1 a 500 caracteres) é validado dentro da ação auditada, para a
   * recusa 422 também entrar na trilha, e vai só para a auditoria: nunca para o usuário suspenso.
   */
  public record SuspendRequest(String reason) {

    /** Sem o motivo em logs. */
    @Override
    public String toString() {
      return "SuspendRequest[REDACTED]";
    }
  }

  /**
   * Sessão aberta de um usuário. {@code ip} (dado pessoal) e {@code device} (rótulo grosseiro,
   * nunca o User-Agent) são omitidos quando nulos, nas sessões anteriores ao registro.
   */
  public record AdminSession(
      UUID id, Instant startedAt, Instant lastUsedAt, String ip, String device, boolean current) {

    @Override
    public String toString() {
      return "AdminSession[id=" + id + "]";
    }
  }

  /** Linha da lista de usuários. {@code name} e {@code lastAccessAt} nulos são omitidos no JSON. */
  public record AdminUserRow(
      long id,
      String email,
      String name,
      Instant createdAt,
      Instant lastAccessAt,
      UserRole role,
      boolean suspended,
      boolean deletionPending) {

    @Override
    public String toString() {
      return "AdminUserRow[id=" + id + "]";
    }
  }

  /**
   * Usuários por situação, na busca informada e ignorando o filtro de situação. {@code active} é
   * quem não está suspenso nem aguardando exclusão (administradores incluídos); {@code suspended},
   * {@code deletionPending} e {@code admin} podem se sobrepor (um suspenso também pode aguardar
   * exclusão).
   */
  public record AdminUserCounts(long active, long suspended, long deletionPending, long admin) {}

  public record AdminUserPage(
      List<AdminUserRow> content, int page, int size, long totalElements, AdminUserCounts counts) {

    @Override
    public String toString() {
      return "AdminUserPage[page=" + page + ", size=" + size + ", total=" + totalElements + "]";
    }
  }

  /** Pedido de troca de e-mail com envio de código numérico de 6 dígitos ao novo endereço. */
  public record EmailChangeRequest(
      @NotBlank(message = "Informe o novo endereço de e-mail.")
          @Email(message = "Endereço de e-mail inválido.")
          @Size(max = 254, message = "O e-mail pode ter no máximo 254 caracteres.")
          String newEmail) {

    @Override
    public String toString() {
      return "EmailChangeRequest[REDACTED]";
    }
  }

  /** Confirmação da troca de e-mail com o código de 6 dígitos numéricos. */
  public record EmailChangeConfirmRequest(
      @NotBlank(message = "Informe o código de confirmação.")
          @Pattern(regexp = "^\\d{6}$", message = "O código de confirmação deve ter 6 dígitos.")
          String code) {

    @Override
    public String toString() {
      return "EmailChangeConfirmRequest[REDACTED]";
    }
  }

  /** Pendência de troca de e-mail exibida no detalhe do usuário e na resposta da solicitação. */
  public record PendingEmailChangeView(String newEmail, Instant expiresAt, int attemptsLeft) {}

  /** Bloqueio temporário de login por tentativas, até quando vale. */
  public record AdminLoginLock(Instant lockedUntil) {}

  /** Exclusão pendente. Nunca a justificativa do administrador. */
  public record AdminDeletionInfo(String origin, Instant requestedAt, Instant dueAt) {}

  /**
   * Detalhe de um usuário. {@code protectedAccount} é o administrador raiz ({@code protected} no
   * JSON). {@code pendingEmailChange} e o estado do aviso de exclusão chegam com as histórias que
   * os produzem.
   */
  public record AdminUserDetail(
      long id,
      String email,
      String name,
      Instant createdAt,
      Instant lastAccessAt,
      UserRole role,
      boolean suspended,
      boolean deletionPending,
      int openSessions,
      AdminLoginLock loginLock,
      AdminDeletionInfo deletion,
      PendingEmailChangeView pendingEmailChange,
      @JsonProperty("protected") boolean protectedAccount,
      List<AuditEntryView> recentActions) {

    @Override
    public String toString() {
      return "AdminUserDetail[id=" + id + "]";
    }
  }
}
