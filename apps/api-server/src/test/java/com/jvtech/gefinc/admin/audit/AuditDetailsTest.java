package com.jvtech.gefinc.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class AuditDetailsTest {

  @Test
  void aceitaApenasChavesDoEnumComNomeJsonEmCamelCase() {
    AuditDetails details =
        AuditDetails.of()
            .put(AuditKey.EMAIL_REF, "abc123")
            .put(AuditKey.DAYS, 7)
            .put(AuditKey.MODE, "GRACE")
            .put(AuditKey.COUNT, 3L)
            .put(AuditKey.PARAMETER, "SIGNUPS_OPEN")
            .put(AuditKey.TO, true);

    assertThat(details.toMap())
        .containsOnlyKeys("emailRef", "days", "mode", "count", "parameter", "to")
        .containsEntry("days", 7L)
        .containsEntry("to", true);
  }

  @Test
  void todasAsChavesTemNomeJsonUnicoSemDadoPessoal() {
    assertThat(AuditKey.values())
        .extracting(AuditKey::json)
        .doesNotHaveDuplicates()
        .allSatisfy(name -> assertThat(name).matches("[a-z][A-Za-z]*"));
    assertThat(AuditKey.values()).hasSize(12);
  }

  @Test
  void recusaEmailUrlETextoLongo() {
    assertThatThrownBy(() -> AuditDetails.of().put(AuditKey.FROM, "ana@example.com"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> AuditDetails.of().put(AuditKey.FROM, "https://exemplo.com/x"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> AuditDetails.of().put(AuditKey.FROM, "x".repeat(65)))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> AuditDetails.of().put(AuditKey.FROM, (String) null))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(AuditDetails.of().put(AuditKey.FROM, "x".repeat(64)).toMap()).hasSize(1);
  }

  @Test
  void toStringMostraSoAsChaves() {
    AuditDetails details = AuditDetails.of().put(AuditKey.FIELD, "name");

    assertThat(details.toString()).doesNotContain("name").contains("field");
  }

  @Test
  void entradaValidaTamanhosEPadroes() {
    AuditEntry entry = AuditEntry.builder(AuditAction.USER_SUSPENDED).target(5L).build();

    assertThat(entry.result()).isEqualTo(AuditResult.SUCCESS);
    assertThat(entry.actorKind()).isEqualTo(ActorKind.ADMIN);
    assertThat(entry.details().toMap()).isEmpty();
    assertThatThrownBy(
            () -> AuditEntry.builder(AuditAction.USER_SUSPENDED).subject("x".repeat(61)).build())
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () ->
                AuditEntry.builder(AuditAction.USER_SUSPENDED).reasonText("x".repeat(1001)).build())
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(
            AuditEntry.builder(AuditAction.ACCESS_DENIED)
                .refusal("ROOT_PROTECTED")
                .build()
                .result())
        .isEqualTo(AuditResult.REFUSED);
  }
}
