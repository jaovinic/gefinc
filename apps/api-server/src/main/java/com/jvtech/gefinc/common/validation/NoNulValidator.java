package com.jvtech.gefinc.common.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/** Valor nulo é válido (use {@code @NotBlank} para exigir presença). */
public class NoNulValidator implements ConstraintValidator<NoNul, CharSequence> {

  @Override
  public boolean isValid(CharSequence value, ConstraintValidatorContext context) {
    if (value == null) {
      return true;
    }
    for (int i = 0; i < value.length(); i++) {
      if (value.charAt(i) == '\u0000') {
        return false;
      }
    }
    return true;
  }
}
