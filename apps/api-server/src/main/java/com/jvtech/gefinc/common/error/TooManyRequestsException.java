package com.jvtech.gefinc.common.error;

/** Limite de solicitações excedido; vira {@code 429} com o cabeçalho {@code Retry-After}. */
public class TooManyRequestsException extends ApiException {

  private final long retryAfterSeconds;

  public TooManyRequestsException(String detail, long retryAfterSeconds) {
    super(ErrorCode.TOO_MANY_REQUESTS, detail);
    this.retryAfterSeconds = retryAfterSeconds;
  }

  public long retryAfterSeconds() {
    return retryAfterSeconds;
  }
}
