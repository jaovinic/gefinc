package com.jvtech.gefinc.common.error;

import org.springframework.http.HttpStatus;

/** Códigos estáveis de erro expostos em {@code Problem.code} (ver contrato OpenAPI). */
public enum ErrorCode {
  VALIDATION_ERROR(HttpStatus.UNPROCESSABLE_ENTITY, "Dados inválidos"),
  BAD_REQUEST(HttpStatus.BAD_REQUEST, "Requisição inválida"),
  UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "Não autenticado"),
  INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "Credenciais inválidas"),
  FORBIDDEN(HttpStatus.FORBIDDEN, "Acesso negado"),
  NOT_FOUND(HttpStatus.NOT_FOUND, "Recurso não encontrado"),
  METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "Método não permitido"),
  CONFLICT(HttpStatus.CONFLICT, "Conflito"),
  EMAIL_ALREADY_REGISTERED(HttpStatus.CONFLICT, "E-mail já cadastrado"),
  STALE_VERSION(HttpStatus.CONFLICT, "O registro foi alterado por outra pessoa"),
  ACCOUNT_DELETION_PENDING(HttpStatus.LOCKED, "Exclusão da conta pendente"),
  NO_PENDING_DELETION(HttpStatus.CONFLICT, "Não há exclusão pendente"),
  INVALID_RESET_TOKEN(HttpStatus.BAD_REQUEST, "Link de redefinição inválido ou expirado"),
  TOO_MANY_REQUESTS(HttpStatus.TOO_MANY_REQUESTS, "Muitas solicitações"),
  CATEGORY_NAME_TAKEN(HttpStatus.CONFLICT, "Já existe uma categoria com este nome"),
  ACCOUNT_IN_USE(HttpStatus.CONFLICT, "Conta com lançamentos"),
  ACCOUNT_NAME_TAKEN(HttpStatus.CONFLICT, "Já existe uma conta ativa com este nome"),
  ACCOUNT_INACTIVE(HttpStatus.UNPROCESSABLE_ENTITY, "Conta inativa"),
  CATEGORY_IN_USE(HttpStatus.CONFLICT, "Categoria em uso"),
  INVOICE_BALANCE_VIOLATION(HttpStatus.CONFLICT, "Saldo da fatura violado"),
  IDEMPOTENCY_IN_PROGRESS(HttpStatus.CONFLICT, "Operação em processamento"),
  IDEMPOTENCY_KEY_REUSED(
      HttpStatus.UNPROCESSABLE_ENTITY, "Chave de idempotência usada em outra operação"),
  ACCOUNT_SUSPENDED(HttpStatus.FORBIDDEN, "Conta suspensa"),
  ADMIN_DECISION_LOCKED(HttpStatus.FORBIDDEN, "Decisão administrativa em vigor"),
  MAINTENANCE(HttpStatus.SERVICE_UNAVAILABLE, "Sistema em manutenção"),
  SIGNUPS_CLOSED(HttpStatus.FORBIDDEN, "Cadastros encerrados"),
  ROOT_PROTECTED(HttpStatus.FORBIDDEN, "Administrador raiz protegido"),
  LAST_ADMIN(HttpStatus.CONFLICT, "Último administrador ativo"),
  SELF_ACTION_FORBIDDEN(HttpStatus.CONFLICT, "Ação não permitida na própria conta"),
  REAUTH_FAILED(HttpStatus.FORBIDDEN, "Senha de confirmação incorreta"),
  INVALID_CONFIRMATION(HttpStatus.UNPROCESSABLE_ENTITY, "Confirmação inválida"),
  MAIL_DELIVERY_FAILED(HttpStatus.BAD_GATEWAY, "Falha no envio do e-mail"),
  INVITATION_EXPIRED(HttpStatus.GONE, "Convite inválido ou expirado"),
  DELETION_ALREADY_EXECUTED(HttpStatus.CONFLICT, "Exclusão já executada"),
  ACCOUNT_NOT_USABLE(HttpStatus.CONFLICT, "Conta indisponível para a operação"),
  EMAIL_CHANGE_CODE_INVALID(HttpStatus.UNPROCESSABLE_ENTITY, "Código de confirmação inválido"),
  REASON_NAME_TAKEN(HttpStatus.CONFLICT, "Já existe um motivo com este nome"),
  LAST_ACTIVE_REASON(HttpStatus.CONFLICT, "Último motivo ativo"),
  INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "Erro interno");

  private final HttpStatus status;
  private final String title;

  ErrorCode(HttpStatus status, String title) {
    this.status = status;
    this.title = title;
  }

  public HttpStatus status() {
    return status;
  }

  public String title() {
    return title;
  }
}
