package com.jvtech.gefinc.user;

/** Publicado quando um usuário conclui o cadastro (ex.: para criar as categorias iniciais). */
public record UserRegisteredEvent(long userId) {}
