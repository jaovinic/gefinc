package com.jvtech.gefinc.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import org.junit.jupiter.api.Test;

/** O PostgreSQL recusa o caractere NUL em texto: a trilha o rejeita antes de chegar ao banco. */
class AuditEntryTest {

  @Test
  void justificativaComNulViraValidacao422ComErroNoCampoReason() {
    assertThatThrownBy(
            () -> AuditEntry.builder(AuditAction.USER_SUSPENDED).reasonText("ab\u0000cd").build())
        .isInstanceOfSatisfying(
            ApiException.class,
            e -> {
              assertThat(e.code()).isEqualTo(ErrorCode.VALIDATION_ERROR);
              assertThat(e.errors()).extracting(m -> m.get("field")).containsExactly("reason");
            });
  }

  @Test
  void subjectERefusalCodeComNulSaoErroDeProgramacao() {
    assertThatThrownBy(
            () -> AuditEntry.builder(AuditAction.USER_SUSPENDED).subject("a\u0000b").build())
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () -> AuditEntry.builder(AuditAction.USER_SUSPENDED).refusal("A\u0000B").build())
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void detalheComNulEhRecusado() {
    assertThatThrownBy(() -> AuditDetails.of().put(AuditKey.FROM, "a\u0000b"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void hasNulReconheceOCaractereEIgnoraNulo() {
    assertThat(AuditEntry.hasNul("a\u0000b")).isTrue();
    assertThat(AuditEntry.hasNul("ab")).isFalse();
    assertThat(AuditEntry.hasNul(null)).isFalse();
  }
}
