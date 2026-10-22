package com.jvtech.gefinc.common.error;

import java.util.LinkedHashMap;
import java.util.Map;

/** Erro de negócio com código estável; vira {@code application/problem+json}. */
public class ApiException extends RuntimeException {

  private final ErrorCode code;
  private final Map<String, Object> extras = new LinkedHashMap<>();

  public ApiException(ErrorCode code, String detail) {
    super(detail);
    this.code = code;
  }

  public ApiException with(String key, Object value) {
    extras.put(key, value);
    return this;
  }

  public ErrorCode code() {
    return code;
  }

  public Map<String, Object> extras() {
    return extras;
  }

  public static ApiException notFound(String detail) {
    return new ApiException(ErrorCode.NOT_FOUND, detail);
  }

  public static ApiException conflict(ErrorCode code, String detail) {
    return new ApiException(code, detail);
  }

  public static ApiException validation(String detail) {
    return new ApiException(ErrorCode.VALIDATION_ERROR, detail);
  }
}
