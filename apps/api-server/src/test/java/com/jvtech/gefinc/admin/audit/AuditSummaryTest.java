package com.jvtech.gefinc.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AuditSummaryTest {

  @Test
  void todaAcaoEResultadoTemResumoCurtoSemDadoPessoal() {
    for (AuditAction action : AuditAction.values()) {
      for (AuditResult result : AuditResult.values()) {
        String summary = AuditSummary.of(action, result);

        assertThat(summary).as("%s/%s", action, result).isNotBlank().hasSizeLessThan(100);
        assertThat(summary).doesNotContain("@").doesNotContain("://");
      }
    }
  }

  @Test
  void textosPorResultado() {
    assertThat(AuditSummary.of(AuditAction.USER_SUSPENDED, AuditResult.SUCCESS))
        .isEqualTo("Usuário suspenso");
    assertThat(AuditSummary.of(AuditAction.USER_SUSPENDED, AuditResult.REFUSED))
        .isEqualTo("Tentativa recusada de suspender o usuário");
    assertThat(AuditSummary.of(AuditAction.USER_SUSPENDED, AuditResult.FAILED))
        .isEqualTo("Falha ao suspender o usuário");
    assertThat(AuditSummary.of(AuditAction.ACCESS_DENIED, AuditResult.REFUSED))
        .isEqualTo("Acesso ao painel negado");
  }
}
