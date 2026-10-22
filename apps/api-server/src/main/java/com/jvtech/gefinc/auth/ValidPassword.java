package com.jvtech.gefinc.auth;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Valida a senha pela {@link PasswordPolicy}. */
@Documented
@Constraint(validatedBy = ValidPassword.Validator.class)
@Target({ElementType.FIELD, ElementType.RECORD_COMPONENT, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidPassword {

  String message() default "Senha inválida.";

  Class<?>[] groups() default {};

  Class<? extends Payload>[] payload() default {};

  class Validator implements ConstraintValidator<ValidPassword, String> {

    private final PasswordPolicy policy = new PasswordPolicy();

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
      var violation = policy.violation(value);
      if (violation.isPresent()) {
        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate(violation.get()).addConstraintViolation();
        return false;
      }
      return true;
    }
  }
}
