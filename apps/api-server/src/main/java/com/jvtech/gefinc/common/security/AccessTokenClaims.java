package com.jvtech.gefinc.common.security;

import java.time.Instant;

/** Conteúdo validado de um token de acesso. */
public record AccessTokenClaims(long userId, int tokenVersion, Instant expiresAt) {}
