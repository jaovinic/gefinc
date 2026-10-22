package com.jvtech.gefinc.auth;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Política de senha: mínimo de 10 caracteres e máximo de 72 <b>bytes</b> em UTF-8 (limite do
 * BCrypt, que ignoraria o excedente). Senha só com espaços é recusada.
 */
@Component
public class PasswordPolicy {

  public static final int MIN_LENGTH = 10;
  public static final int MAX_BYTES = 72;

  public boolean isValid(String password) {
    return violation(password).isEmpty();
  }

  /** Motivo da recusa em português, ou vazio se a senha é aceita. */
  public Optional<String> violation(String password) {
    if (password == null
        || password.isBlank()
        || password.codePointCount(0, password.length()) < MIN_LENGTH) {
      return Optional.of("A senha deve ter pelo menos " + MIN_LENGTH + " caracteres.");
    }
    if (password.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
      return Optional.of(
          "A senha deve ter no máximo " + MAX_BYTES + " bytes (use menos caracteres especiais).");
    }
    return Optional.empty();
  }
}
