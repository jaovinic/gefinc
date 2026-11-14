package com.jvtech.gefinc.common.mail;

/**
 * Política de tentativas: {@code SYNC_ONCE} faz uma única tentativa (usada quando uma pessoa espera
 * a resposta); {@code WITH_RETRY} re-tenta falhas transitórias conforme a configuração.
 */
public enum DeliveryMode {
  SYNC_ONCE,
  WITH_RETRY
}
