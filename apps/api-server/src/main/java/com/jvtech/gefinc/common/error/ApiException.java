package com.jvtech.gefinc.common.error;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Erro de negócio com código estável; vira {@code application/problem+json}. */
public class ApiException extends RuntimeException {

  private final ErrorCode code;
  private final Map<String, Object> extras = new LinkedHashMap<>();
  private final List<Map<String, String>> errors = new ArrayList<>();

  public ApiException(ErrorCode code, String detail) {
    super(detail);
    this.code = code;
  }

  public ApiException with(String key, Object value) {
    extras.put(key, value);
    return this;
  }

  /** Acrescenta um erro de campo (lista {@code errors} do problema de validação). */
  public ApiException withFieldError(String field, String message) {
    errors.add(Map.of("field", field, "message", message));
    return this;
  }

  public List<Map<String, String>> errors() {
    return errors;
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
