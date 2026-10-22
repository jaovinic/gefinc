package com.jvtech.gefinc.common.error;

import com.jvtech.gefinc.common.json.MoneyFormatException;
import jakarta.validation.ConstraintViolationException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Converte exceções em {@code application/problem+json} (RFC 7807) com o campo estável {@code
 * code}.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(TooManyRequestsException.class)
  ResponseEntity<ProblemDetail> handleTooMany(TooManyRequestsException ex) {
    ProblemDetail body = ProblemFactory.create(ex.code(), ex.getMessage(), ex.extras(), List.of());
    return ResponseEntity.status(ex.code().status())
        .header("Retry-After", Long.toString(ex.retryAfterSeconds()))
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(body);
  }

  @ExceptionHandler(ApiException.class)
  ResponseEntity<ProblemDetail> handleApi(ApiException ex) {
    return problem(ex.code(), ex.getMessage(), ex.extras(), List.of());
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<ProblemDetail> handleBeanValidation(MethodArgumentNotValidException ex) {
    List<Map<String, String>> errors = new ArrayList<>();
    ex.getBindingResult()
        .getFieldErrors()
        .forEach(
            e ->
                errors.add(
                    Map.of("field", e.getField(), "message", message(e.getDefaultMessage()))));
    ex.getBindingResult()
        .getGlobalErrors()
        .forEach(
            e ->
                errors.add(
                    Map.of("field", e.getObjectName(), "message", message(e.getDefaultMessage()))));
    return problem(ErrorCode.VALIDATION_ERROR, "Há campos inválidos.", Map.of(), errors);
  }

  @ExceptionHandler(ConstraintViolationException.class)
  ResponseEntity<ProblemDetail> handleConstraint(ConstraintViolationException ex) {
    List<Map<String, String>> errors = new ArrayList<>();
    ex.getConstraintViolations()
        .forEach(
            v ->
                errors.add(
                    Map.of(
                        "field",
                        v.getPropertyPath().toString(),
                        "message",
                        message(v.getMessage()))));
    return problem(ErrorCode.VALIDATION_ERROR, "Há campos inválidos.", Map.of(), errors);
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  ResponseEntity<ProblemDetail> handleUnreadable(HttpMessageNotReadableException ex) {
    Throwable cause = ex.getMostSpecificCause();
    if (cause instanceof MoneyFormatException) {
      return problem(ErrorCode.VALIDATION_ERROR, cause.getMessage(), Map.of(), List.of());
    }
    return problem(ErrorCode.BAD_REQUEST, "Corpo da requisição ilegível.", Map.of(), List.of());
  }

  @ExceptionHandler({
    MethodArgumentTypeMismatchException.class,
    MissingServletRequestParameterException.class
  })
  ResponseEntity<ProblemDetail> handleBadParameter(Exception ex) {
    return problem(ErrorCode.BAD_REQUEST, "Parâmetro ausente ou inválido.", Map.of(), List.of());
  }

  @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
  ResponseEntity<ProblemDetail> handleStale(ObjectOptimisticLockingFailureException ex) {
    return problem(
        ErrorCode.STALE_VERSION,
        "O registro foi alterado por outra pessoa. Recarregue e tente novamente.",
        Map.of(),
        List.of());
  }

  @ExceptionHandler(AccessDeniedException.class)
  ResponseEntity<ProblemDetail> handleDenied(AccessDeniedException ex) {
    return problem(ErrorCode.FORBIDDEN, "Acesso negado.", Map.of(), List.of());
  }

  @ExceptionHandler(NoResourceFoundException.class)
  ResponseEntity<ProblemDetail> handleNoResource(NoResourceFoundException ex) {
    return problem(ErrorCode.NOT_FOUND, "Recurso não encontrado.", Map.of(), List.of());
  }

  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  ResponseEntity<ProblemDetail> handleMethod(HttpRequestMethodNotSupportedException ex) {
    return problem(ErrorCode.METHOD_NOT_ALLOWED, "Método não permitido.", Map.of(), List.of());
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ProblemDetail> handleUnexpected(Exception ex) {
    log.error("Erro inesperado", ex);
    return problem(ErrorCode.INTERNAL_ERROR, "Ocorreu um erro inesperado.", Map.of(), List.of());
  }

  static ResponseEntity<ProblemDetail> problem(
      ErrorCode code, String detail, Map<String, Object> extras, List<Map<String, String>> errors) {
    ProblemDetail body = ProblemFactory.create(code, detail, extras, errors);
    return ResponseEntity.status(code.status())
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(body);
  }

  private static String message(String value) {
    return value == null ? "inválido" : value;
  }
}
