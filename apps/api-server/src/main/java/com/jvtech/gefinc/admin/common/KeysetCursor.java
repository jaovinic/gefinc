package com.jvtech.gefinc.admin.common;

import com.jvtech.gefinc.common.error.ApiException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

/**
 * Cursor opaco de paginação por posição {@code (occurred_at, id)} decrescente. Codificado em
 * Base64URL sem preenchimento ({@code =}) como {@code "<epochMicros>:<id>"}. Não autoriza nada e
 * qualquer valor malformado ou fora de faixa responde {@code 422} no campo {@code cursor} antes de
 * chegar ao banco.
 */
public record KeysetCursor(Instant occurredAt, long id) {

  private static final int MAX_RAW_LENGTH = 200;
  private static final long MAX_EPOCH_MICROS =
      253_402_300_799_999_999L; // 9999-12-31T23:59:59.999999Z
  private static final long MICROS_PER_SECOND = 1_000_000L;
  private static final long NANOS_PER_MICRO = 1_000L;

  public String encode() {
    long micros =
        Math.multiplyExact(occurredAt.getEpochSecond(), MICROS_PER_SECOND)
            + occurredAt.getNano() / NANOS_PER_MICRO;
    String payload = micros + ":" + id;
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
  }

  public static KeysetCursor decode(String raw) {
    if (raw == null || raw.isEmpty() || raw.length() > MAX_RAW_LENGTH || !isBase64UrlNoPad(raw)) {
      throw invalid();
    }
    String payload;
    try {
      byte[] bytes = Base64.getUrlDecoder().decode(raw);
      payload = new String(bytes, StandardCharsets.UTF_8);
    } catch (IllegalArgumentException e) {
      throw invalid();
    }
    if (payload.indexOf('\0') >= 0) {
      throw invalid();
    }
    int colon = payload.indexOf(':');
    if (colon <= 0 || colon != payload.lastIndexOf(':') || colon == payload.length() - 1) {
      throw invalid();
    }
    String microsPart = payload.substring(0, colon);
    String idPart = payload.substring(colon + 1);
    if (!isAsciiDigits(microsPart) || !isAsciiDigits(idPart)) {
      throw invalid();
    }
    long micros;
    long id;
    try {
      micros = Long.parseLong(microsPart);
      id = Long.parseLong(idPart);
    } catch (NumberFormatException e) {
      throw invalid();
    }
    if (micros < 0 || micros > MAX_EPOCH_MICROS || id <= 0) {
      throw invalid();
    }
    Instant occurredAt =
        Instant.ofEpochSecond(
            micros / MICROS_PER_SECOND, (micros % MICROS_PER_SECOND) * NANOS_PER_MICRO);
    return new KeysetCursor(occurredAt, id);
  }

  private static boolean isBase64UrlNoPad(String s) {
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      boolean ok =
          (c >= 'A' && c <= 'Z')
              || (c >= 'a' && c <= 'z')
              || (c >= '0' && c <= '9')
              || c == '-'
              || c == '_';
      if (!ok) {
        return false;
      }
    }
    return true;
  }

  private static boolean isAsciiDigits(String s) {
    if (s.isEmpty()) {
      return false;
    }
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      if (c < '0' || c > '9') {
        return false;
      }
    }
    return true;
  }

  private static ApiException invalid() {
    return ApiException.validation("Há campos inválidos.")
        .withFieldError("cursor", "Cursor inválido.");
  }
}
