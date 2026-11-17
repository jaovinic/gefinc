package com.jvtech.gefinc.common.security;

import java.time.Instant;
import java.util.UUID;

/**
 * Conteúdo validado de um token de acesso. {@code sessionId} (claim {@code sid}) é nulo nos tokens
 * emitidos antes de a sessão existir.
 */
public record AccessTokenClaims(long userId, int tokenVersion, UUID sessionId, Instant expiresAt) {}
