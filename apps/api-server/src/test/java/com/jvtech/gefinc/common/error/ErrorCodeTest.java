package com.jvtech.gefinc.common.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/**
 * Códigos de erro do painel administrativo: status estável, título em português e nenhuma recusa de
 * regra com 401 (o cliente trata 401 como sessão expirada e tenta renovar o token).
 */
class ErrorCodeTest {

  private static final Map<String, HttpStatus> ADMIN_CODES =
      Map.ofEntries(
          Map.entry("ACCOUNT_SUSPENDED", HttpStatus.FORBIDDEN),
          Map.entry("ADMIN_DECISION_LOCKED", HttpStatus.FORBIDDEN),
          Map.entry("MAINTENANCE", HttpStatus.SERVICE_UNAVAILABLE),
          Map.entry("SIGNUPS_CLOSED", HttpStatus.FORBIDDEN),
          Map.entry("ROOT_PROTECTED", HttpStatus.FORBIDDEN),
          Map.entry("LAST_ADMIN", HttpStatus.CONFLICT),
          Map.entry("SELF_ACTION_FORBIDDEN", HttpStatus.CONFLICT),
          Map.entry("REAUTH_FAILED", HttpStatus.FORBIDDEN),
          Map.entry("INVALID_CONFIRMATION", HttpStatus.UNPROCESSABLE_ENTITY),
          Map.entry("MAIL_DELIVERY_FAILED", HttpStatus.BAD_GATEWAY),
          Map.entry("INVITATION_EXPIRED", HttpStatus.GONE),
          Map.entry("DELETION_ALREADY_EXECUTED", HttpStatus.CONFLICT),
          Map.entry("ACCOUNT_NOT_USABLE", HttpStatus.CONFLICT),
          Map.entry("EMAIL_CHANGE_CODE_INVALID", HttpStatus.UNPROCESSABLE_ENTITY),
          Map.entry("REASON_NAME_TAKEN", HttpStatus.CONFLICT),
          Map.entry("LAST_ACTIVE_REASON", HttpStatus.CONFLICT));

  @Test
  void osDezesseisCodigosDoPainelExistemComOStatusCombinado() {
    assertThat(ADMIN_CODES).hasSize(16);
    ADMIN_CODES.forEach(
        (name, status) -> {
          ErrorCode code = ErrorCode.valueOf(name);
          assertThat(code.status()).as(name).isEqualTo(status);
          assertThat(code.title()).as(name).isNotBlank().isNotEqualTo(name);
        });
  }

  @Test
  void recusaDeRegraNuncaUsa401() {
    ADMIN_CODES
        .keySet()
        .forEach(
            name ->
                assertThat(ErrorCode.valueOf(name).status())
                    .as(name)
                    .isNotEqualTo(HttpStatus.UNAUTHORIZED));
  }

  @Test
  void titulosSaoUnicosEmPortugues() {
    Set<String> titles = new HashSet<>();
    for (ErrorCode code : ErrorCode.values()) {
      assertThat(titles.add(code.title())).as("título repetido de %s", code).isTrue();
    }
  }

  @Test
  void internalErrorContinuaSendoOUltimo() {
    ErrorCode[] values = ErrorCode.values();
    assertThat(values[values.length - 1]).isEqualTo(ErrorCode.INTERNAL_ERROR);
  }

  @Test
  void codigosAntigosMantemStatus() {
    assertThat(ErrorCode.ACCOUNT_DELETION_PENDING.status()).isEqualTo(HttpStatus.LOCKED);
    assertThat(ErrorCode.TOO_MANY_REQUESTS.status()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    assertThat(ErrorCode.INVALID_CREDENTIALS.status()).isEqualTo(HttpStatus.UNAUTHORIZED);
  }
}
