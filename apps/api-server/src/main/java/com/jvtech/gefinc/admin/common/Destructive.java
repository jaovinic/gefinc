package com.jvtech.gefinc.admin.common;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marca a ação administrativa destrutiva (exclusão de conta, retirada de perfil...): além da cota
 * de escritas comuns, passa pela cota própria, mais baixa, das destrutivas.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface Destructive {}
