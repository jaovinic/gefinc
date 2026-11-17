package com.jvtech.gefinc.admin.common;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * Marca o controlador (ou método) do painel como exclusivo de administradores (administrador comum
 * ou raiz). É a segunda camada, ao lado da regra de URL de {@code /admin/**}: se alguém registrar
 * uma rota fora do padrão, a anotação ainda a fecha. {@code AdminAccessIT} exige a anotação em todo
 * controlador do painel.
 */
@Documented
@PreAuthorize("hasRole('ADMIN')")
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface AdminOnly {}
