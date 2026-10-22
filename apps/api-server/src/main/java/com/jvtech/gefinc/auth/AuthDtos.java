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
      @ValidPassword String password) {}

  public record LoginRequest(
      @NotBlank(message = "Informe o e-mail.") String email,
      @NotBlank(message = "Informe a senha.") String password) {}

  public record RefreshRequest(String refreshToken) {}

  public record PasswordResetRequest(
      @NotBlank(message = "Informe o e-mail.") @Email(message = "E-mail inválido.") String email) {}

  public record PasswordResetConfirm(
      @NotBlank(message = "Informe o token.") String token, @ValidPassword String newPassword) {}

  public record AccountDeletionRequest(@NotBlank(message = "Informe a senha.") String password) {}

  public record UserProfile(long id, String email, Instant createdAt) {}

  public record TokenResponse(String accessToken, long expiresIn, String refreshToken) {}

  public record DeletionScheduled(LocalDate deletionDate) {}
}
