package com.jvtech.gefinc.common.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Recusa o caractere NUL ({@code U+0000}) em texto livre. O PostgreSQL não o aceita em colunas de
 * texto, e um NUL que chega ao banco vira erro 500; com esta restrição vira 422.
 */
@Documented
@Constraint(validatedBy = NoNulValidator.class)
@Target({ElementType.FIELD, ElementType.RECORD_COMPONENT, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface NoNul {

  String message() default "O texto contém caracteres inválidos.";

  Class<?>[] groups() default {};

  Class<? extends Payload>[] payload() default {};
}
