package com.jvtech.gefinc.common.json;

/** Valor monetário fora do formato do contrato (string decimal com exatamente 2 casas). */
public class MoneyFormatException extends RuntimeException {

  public MoneyFormatException(String message) {
    super(message);
  }
}
