package com.jvtech.gefinc.admin.deletion;

import com.jvtech.gefinc.common.error.ApiException;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Validador heurístico de mensagens genéricas dos motivos de exclusão (T146, D7, FR-046): recusa
 * e-mails, sequências de 8 ou mais dígitos (documentos, telefones), marcadores de
 * template/substituição e URLs.
 */
@Component
public class GenericMessageValidator {

  public static final int MAX_LENGTH = 500;

  private static final Pattern EMAIL_PATTERN =
      Pattern.compile("[^\\s<>\"',;:]+@[^\\s<>\"',;:]+\\.[^\\s<>\"',;:]+");
  private static final Pattern DIGITS_PATTERN = Pattern.compile("\\d{8,}");
  private static final Pattern TEMPLATE_PATTERN =
      Pattern.compile("(\\{\\{|\\$\\{|\\{[a-zA-Z0-9_]+\\}|%[0-9]*\\$?[a-zA-Z])");
  private static final Pattern URL_PATTERN = Pattern.compile("(?i)(https?://|www\\.)");

  /**
   * Valida a mensagem genérica. Lança {@link ApiException} de validação se violar qualquer regra.
   */
  public void validate(String message) {
    if (message == null || message.isBlank()) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("message", "A mensagem genérica não pode ser vazia.");
    }
    String trimmed = message.strip();
    if (trimmed.length() > MAX_LENGTH) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError(
              "message", "A mensagem genérica deve ter no máximo " + MAX_LENGTH + " caracteres.");
    }
    if (EMAIL_PATTERN.matcher(trimmed).find()) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("message", "A mensagem genérica não pode conter endereços de e-mail.");
    }
    if (DIGITS_PATTERN.matcher(trimmed).find()) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError(
              "message", "A mensagem genérica não pode conter números com 8 ou mais dígitos.");
    }
    if (TEMPLATE_PATTERN.matcher(trimmed).find()) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError(
              "message", "A mensagem genérica não pode conter marcadores de substituição.");
    }
    if (URL_PATTERN.matcher(trimmed).find()) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError(
              "message", "A mensagem genérica não pode conter links ou endereços de internet.");
    }
  }

  public boolean isValid(String message) {
    try {
      validate(message);
      return true;
    } catch (ApiException e) {
      return false;
    }
  }
}
