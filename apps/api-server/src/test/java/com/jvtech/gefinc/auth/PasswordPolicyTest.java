package com.jvtech.gefinc.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PasswordPolicyTest {

  private final PasswordPolicy policy = new PasswordPolicy();

  @Test
  void aceitaDezCaracteresOuMais() {
    assertThat(policy.isValid("1234567890")).isTrue();
    assertThat(policy.isValid("uma frase longa e segura")).isTrue();
  }

  @Test
  void recusaMenosDeDezCaracteres() {
    assertThat(policy.isValid("123456789")).isFalse();
    assertThat(policy.isValid("")).isFalse();
    assertThat(policy.isValid(null)).isFalse();
  }

  @Test
  void recusaSenhaSoComEspacos() {
    assertThat(policy.isValid("          ")).isFalse();
  }

  @Test
  void limitaEm72BytesEmUtf8NaoEm72Caracteres() {
    assertThat(policy.isValid("a".repeat(72))).isTrue();
    assertThat(policy.isValid("a".repeat(73))).isFalse();
    // "ç" ocupa 2 bytes: 36 letras = 72 bytes (ok); 37 letras = 74 bytes (acima do limite do
    // BCrypt)
    assertThat(policy.isValid("ç".repeat(36))).isTrue();
    assertThat(policy.isValid("ç".repeat(37))).isFalse();
  }

  @Test
  void informaOMotivoDaRecusa() {
    assertThat(policy.violation("curta"))
        .hasValueSatisfying(v -> assertThat(v).contains("pelo menos 10"));
    assertThat(policy.violation("a".repeat(80)))
        .hasValueSatisfying(v -> assertThat(v).contains("72 bytes"));
    assertThat(policy.violation("uma senha valida")).isEmpty();
  }
}
