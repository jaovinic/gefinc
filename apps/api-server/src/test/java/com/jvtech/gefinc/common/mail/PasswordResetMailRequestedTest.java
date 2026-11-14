package com.jvtech.gefinc.common.mail;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PasswordResetMailRequestedTest {

  @Test
  void toStringNaoExpoeDestinatarioNemToken() {
    PasswordResetMailRequested event =
        new PasswordResetMailRequested(
            "ana@example.com", "http://localhost:4200/reset-password?token=segredo123", 42L);

    assertThat(event.toString()).doesNotContain("ana@example.com").doesNotContain("segredo123");
  }

  @Test
  void construtorDeDoisArgumentosDeixaOUsuarioNulo() {
    PasswordResetMailRequested event =
        new PasswordResetMailRequested("ana@example.com", "http://x");

    assertThat(event.userId()).isNull();
  }
}
