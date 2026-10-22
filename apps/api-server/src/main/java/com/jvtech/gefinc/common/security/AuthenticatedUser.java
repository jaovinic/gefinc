package com.jvtech.gefinc.common.security;

/** Principal autenticado: o identificador vem sempre do token, nunca de parâmetro da requisição. */
public record AuthenticatedUser(long id) {}
