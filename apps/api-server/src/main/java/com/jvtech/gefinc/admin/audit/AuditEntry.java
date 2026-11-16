package com.jvtech.gefinc.admin.audit;

import com.jvtech.gefinc.common.error.ApiException;

/**
 * Registro a gravar na trilha. {@code reasonText} é a justificativa informada pelo administrador (a
 * única parte livre); {@code subject} é o alvo que não é usuário (chave do parâmetro, id do
 * motivo/convite, rota negada).
 */
public record AuditEntry(
    AuditAction action,
    AuditResult result,
    ActorKind actorKind,
    Long actorUserId,
    Long targetUserId,
    String subject,
    String reasonText,
    String refusalCode,
    AuditDetails details) {

  public AuditEntry {
    if (action == null || result == null || actorKind == null) {
      throw new IllegalArgumentException("Ação, resultado e tipo de ator são obrigatórios.");
    }
    if (subject != null && subject.length() > 60
        || reasonText != null && reasonText.length() > 1000
        || refusalCode != null && refusalCode.length() > 32) {
      throw new IllegalArgumentException("Campo de auditoria acima do tamanho permitido.");
    }
    if (hasNul(subject) || hasNul(refusalCode)) {
      throw new IllegalArgumentException("Campo de auditoria com caractere inválido.");
    }
    if (hasNul(reasonText)) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("reason", "O texto contém caracteres inválidos.");
    }
    if (details == null) {
      details = AuditDetails.of();
    }
  }

  /** O PostgreSQL recusa o caractere NUL em texto; ele nunca pode chegar à trilha. */
  public static boolean hasNul(String value) {
    return value != null && value.indexOf('\u0000') >= 0;
  }

  public static Builder builder(AuditAction action) {
    return new Builder(action);
  }

  /** Padrões: resultado {@code SUCCESS}, ator {@code ADMIN}. */
  public static final class Builder {
    private final AuditAction action;
    private AuditResult result = AuditResult.SUCCESS;
    private ActorKind actorKind = ActorKind.ADMIN;
    private Long actorUserId;
    private Long targetUserId;
    private String subject;
    private String reasonText;
    private String refusalCode;
    private AuditDetails details;

    private Builder(AuditAction action) {
      this.action = action;
    }

    public Builder result(AuditResult value) {
      this.result = value;
      return this;
    }

    public Builder actor(ActorKind kind, Long userId) {
      this.actorKind = kind;
      this.actorUserId = userId;
      return this;
    }

    public Builder target(Long userId) {
      this.targetUserId = userId;
      return this;
    }

    public Builder subject(String value) {
      this.subject = value;
      return this;
    }

    public Builder reasonText(String value) {
      this.reasonText = value;
      return this;
    }

    public Builder refusal(String code) {
      this.result = AuditResult.REFUSED;
      this.refusalCode = code;
      return this;
    }

    public Builder details(AuditDetails value) {
      this.details = value;
      return this;
    }

    public AuditEntry build() {
      return new AuditEntry(
          action,
          result,
          actorKind,
          actorUserId,
          targetUserId,
          subject,
          reasonText,
          refusalCode,
          details);
    }
  }
}
