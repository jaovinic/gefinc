package com.jvtech.gefinc.common.security;

/** Estado do usuário relevante para validar um token de acesso já emitido. */
public record TokenState(int tokenVersion, boolean deletionPending) {}
