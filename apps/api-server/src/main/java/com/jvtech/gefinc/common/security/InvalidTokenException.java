package com.jvtech.gefinc.common.security;

/** Token de acesso ausente, malformado, adulterado ou expirado. */
public class InvalidTokenException extends RuntimeException {

  public InvalidTokenException(String message, Throwable cause) {
    super(message, cause);
  }
}
