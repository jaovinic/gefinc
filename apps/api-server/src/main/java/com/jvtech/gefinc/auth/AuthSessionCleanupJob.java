package com.jvtech.gefinc.auth;

import org.springframework.stereotype.Component;

/** Rotina diária que remove as sessões encerradas ou expiradas há mais de 30 dias. */
@Component
public class AuthSessionCleanupJob {

  public void run() {
    throw new UnsupportedOperationException("esqueleto: implementado junto com a sessão");
  }
}
