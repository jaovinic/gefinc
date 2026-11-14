package com.jvtech.gefinc.common.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class MailTemplatesTest {

  /** Modelo e placeholders declarados (FR-037: nenhum modelo recebe justificativa livre). */
  private static final Map<String, Set<String>> TEMPLATES =
      Map.ofEntries(
          Map.entry("password-reset", Set.of("link")),
          Map.entry("invitation", Set.of("link", "validade")),
          Map.entry("deletion-notice-grace", Set.of("data", "mensagem")),
          Map.entry("deletion-notice-immediate", Set.of("mensagem")),
          Map.entry("deletion-canceled-active", Set.of()),
          Map.entry("deletion-canceled-continues", Set.of("detalhe")),
          Map.entry("email-change-code", Set.of("codigo", "validade")),
          Map.entry("email-change-notice-old", Set.of()),
          Map.entry("email-change-notice-new", Set.of()),
          Map.entry("test", Set.of()));

  private static String raw(String name) throws IOException {
    byte[] bytes = new ClassPathResource("mail/" + name + ".txt").getInputStream().readAllBytes();
    try {
      return StandardCharsets.UTF_8
          .newDecoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .decode(ByteBuffer.wrap(bytes))
          .toString();
    } catch (CharacterCodingException e) {
      throw new IllegalStateException(name + " não é UTF-8 válido", e);
    }
  }

  @Test
  void cadaModeloExisteEmUtf8EUsaSoOsPlaceholdersDeclarados() throws IOException {
    for (Map.Entry<String, Set<String>> template : TEMPLATES.entrySet()) {
      String text = raw(template.getKey());
      assertThat(text).as(template.getKey()).isNotBlank().startsWith("Olá,").contains("GEFINC");
      assertThat(MailTemplates.placeholders(template.getKey()))
          .as(template.getKey())
          .containsExactlyInAnyOrderElementsOf(template.getValue());
    }
  }

  @Test
  void nenhumModeloRecebeJustificativaLivre() throws IOException {
    for (String name : TEMPLATES.keySet()) {
      assertThat(MailTemplates.placeholders(name))
          .as(name)
          .noneMatch(
              p ->
                  p.contains("justific")
                      || p.contains("motivo")
                      || p.contains("reason")
                      || p.contains("texto"));
      assertThat(raw(name).toLowerCase()).as(name).doesNotContain("justificativa");
    }
  }

  @Test
  void renderizaSubstituindoCadaPlaceholder() {
    String text =
        MailTemplates.render(
            "invitation",
            Map.of("link", "http://localhost:4200/accept?token=abc", "validade", "7 dias"));

    assertThat(text)
        .contains("http://localhost:4200/accept?token=abc")
        .contains("7 dias")
        .doesNotContain("{{");
  }

  @Test
  void valorComChavesNaoEhReinterpretadoComoPlaceholder() {
    String text = MailTemplates.render("password-reset", Map.of("link", "http://x/{{outro}}?a=$1"));

    assertThat(text).contains("http://x/{{outro}}?a=$1");
  }

  @Test
  void placeholderSemValorOuValorSobrandoFalha() {
    assertThatThrownBy(() -> MailTemplates.render("invitation", Map.of("link", "x")))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> MailTemplates.render("test", Map.of("link", "x")))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> MailTemplates.render("nao-existe", Map.of()))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void modelosSemPlaceholderRenderizamIguais() throws IOException {
    assertThat(MailTemplates.render("test", Map.of())).isEqualTo(raw("test"));
  }
}
