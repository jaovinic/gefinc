package com.jvtech.gefinc.admin.common;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marca o controlador (ou método) do painel como exclusivo de administradores. Esqueleto: a
 * verificação de papel entra junto com a regra de URL.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface AdminOnly {}
