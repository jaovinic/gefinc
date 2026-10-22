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
  ACCOUNT_IN_USE(HttpStatus.CONFLICT, "Conta com lançamentos"),
  ACCOUNT_NAME_TAKEN(HttpStatus.CONFLICT, "Já existe uma conta ativa com este nome"),
  ACCOUNT_INACTIVE(HttpStatus.UNPROCESSABLE_ENTITY, "Conta inativa"),
  CATEGORY_IN_USE(HttpStatus.CONFLICT, "Categoria em uso"),
  INVOICE_BALANCE_VIOLATION(HttpStatus.CONFLICT, "Saldo da fatura violado"),
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
