package com.jvtech.gefinc.account;

/**
 * Publicado quando o dia de fechamento ou de vencimento de um cartão muda. Os lançamentos fixos
 * pendentes e futuros são recalculados por quem ouvir este evento (FR-014).
 */
public record CardDaysChangedEvent(long userId, long accountId) {}
