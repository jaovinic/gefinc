package com.jvtech.gefinc.admin.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/** Cursor de paginação por posição {@code (instante, id)}: opaco, sem assinatura, sem lixo. */
class KeysetCursorTest {

  private static String b64(String payload) {
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
  }

  @Test
  void codificaEDecodificaSemPerdaDeMicrossegundos() {
    Instant at = Instant.parse("2026-11-10T15:00:00.123456Z");

    String encoded = new KeysetCursor(at, 42L).encode();
    KeysetCursor decoded = KeysetCursor.decode(encoded);

    assertThat(decoded.occurredAt()).isEqualTo(at);
    assertThat(decoded.id()).isEqualTo(42L);
  }

  @Test
  void ficaEmBase64UrlSemPreenchimentoENuncaMostraAPosicaoEmClaro() {
    String encoded = new KeysetCursor(Instant.parse("2026-11-10T15:00:00Z"), 7L).encode();

    assertThat(encoded).matches("[A-Za-z0-9_-]+").doesNotContain("=").hasSizeLessThan(60);
    assertThat(encoded).doesNotContain("2026").doesNotContain("7:");
  }

  static List<String> invalidCursors() {
    return List.of(
        "!!!",
        "abc",
        "====",
        b64("nao-sei"),
        b64("1:2:3"),
        b64("-1:5"),
        b64("1763391600000000:0"),
        b64("1763391600000000:-4"),
        b64("abc:5"),
        b64("1763391600000000:abc"),
        b64("1763391600000000:99999999999999999999"),
        b64("99999999999999999999:5"),
        b64("253402300800000000:5"),
        b64("1763391600000000:5\0"),
        b64("17633916\0:5"),
        b64("1763391600000000:5") + "=",
        "MTIz\0NDU2",
        "x".repeat(201),
        "ç" + b64("1763391600000000:5"),
        " " + b64("1763391600000000:5"));
  }

  @ParameterizedTest
  @MethodSource("invalidCursors")
  void cursorInvalidoDa422NoCampoCursor(String raw) {
    assertThatThrownBy(() -> KeysetCursor.decode(raw))
        .isInstanceOfSatisfying(
            ApiException.class,
            e -> {
              assertThat(e.code()).isEqualTo(ErrorCode.VALIDATION_ERROR);
              assertThat(e.errors()).hasSize(1);
              assertThat(e.errors().get(0)).containsEntry("field", "cursor");
              assertThat(e.getMessage()).doesNotContain(raw.trim());
            });
  }
}
