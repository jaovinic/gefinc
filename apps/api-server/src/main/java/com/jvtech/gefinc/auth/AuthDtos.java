package com.jvtech.gefinc.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.jvtech.gefinc.common.validation.NoNul;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

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
      @NotBlank(message = "Informe o e-mail.") @NoNul String email,
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
      @Size(max = 80, message = "O nome pode ter no máximo 80 caracteres.") @NoNul String name) {
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

  public record UserNoticeDto(
      long id,
      String kind,
      String variant,
      @JsonInclude(JsonInclude.Include.NON_NULL) LocalDate originalDeletionDate,
      String message) {
    /** Sem dados sensíveis em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "UserNoticeDto[REDACTED]";
    }
  }

  /**
   * {@code admin}: conveniência de interface para mostrar o painel; a barreira de acesso é sempre
   * do servidor. {@code notices}: avisos de entrega única ao usuário (D22).
   */
  public record UserProfile(
      long id,
      String email,
      String name,
      Instant createdAt,
      boolean admin,
      @JsonInclude(JsonInclude.Include.NON_NULL) List<UserNoticeDto> notices) {
    public UserProfile(long id, String email, String name, Instant createdAt, boolean admin) {
      this(id, email, name, createdAt, admin, null);
    }

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
