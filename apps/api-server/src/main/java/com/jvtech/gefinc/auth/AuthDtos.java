package com.jvtech.gefinc.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;

/** Corpos de requisição e resposta de {@code /auth/*}, conforme o contrato OpenAPI. */
public final class AuthDtos {

  private AuthDtos() {}

  public record RegisterRequest(
      @NotBlank(message = "Informe o e-mail.")
          @Email(message = "E-mail inválido.")
          @Size(max = 254, message = "E-mail muito longo.")
          String email,
      @ValidPassword String password) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "RegisterRequest[REDACTED]";
    }
  }

  public record LoginRequest(
      @NotBlank(message = "Informe o e-mail.") String email,
      @NotBlank(message = "Informe a senha.") String password) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "LoginRequest[REDACTED]";
    }
  }

  public record RefreshRequest(String refreshToken) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "RefreshRequest[REDACTED]";
    }
  }

  public record PasswordResetRequest(
      @NotBlank(message = "Informe o e-mail.") @Email(message = "E-mail inválido.") String email) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "PasswordResetRequest[REDACTED]";
    }
  }

  public record PasswordResetConfirm(
      @NotBlank(message = "Informe o token.") String token, @ValidPassword String newPassword) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "PasswordResetConfirm[REDACTED]";
    }
  }

  public record AccountDeletionRequest(@NotBlank(message = "Informe a senha.") String password) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "AccountDeletionRequest[REDACTED]";
    }
  }

  public record UpdateProfileRequest(
      @Size(max = 80, message = "O nome pode ter no máximo 80 caracteres.") String name) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "UpdateProfileRequest[REDACTED]";
    }
  }

  public record ChangePasswordRequest(
      @NotBlank(message = "Informe a senha atual.") String currentPassword,
      @ValidPassword String newPassword) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "ChangePasswordRequest[REDACTED]";
    }
  }

  public record UserProfile(long id, String email, String name, Instant createdAt) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "UserProfile[REDACTED]";
    }
  }

  public record TokenResponse(String accessToken, long expiresIn, String refreshToken) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "TokenResponse[REDACTED]";
    }
  }

  public record DeletionScheduled(LocalDate deletionDate) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "DeletionScheduled[REDACTED]";
    }
  }
}
