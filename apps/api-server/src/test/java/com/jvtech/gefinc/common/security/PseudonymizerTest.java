package com.jvtech.gefinc.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jvtech.gefinc.common.security.Pseudonymizer.Domain;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class PseudonymizerTest {

  private static final String SECRET = "segredo-de-teste-para-pseudonimos-0123456789";

  private final Pseudonymizer pseudonymizer = new Pseudonymizer(SECRET);

  @Test
  void referenciaEEstavelEComTrintaEDoisHexadecimais() {
    String first = pseudonymizer.emailRef("ana@example.com");

    assertThat(first).hasSize(32).matches("[0-9a-f]{32}");
    assertThat(pseudonymizer.emailRef("ana@example.com")).isEqualTo(first);
    assertThat(pseudonymizer.userRef(7)).isEqualTo(pseudonymizer.userRef(7));
    assertThat(pseudonymizer.userRef(7)).isNotEqualTo(pseudonymizer.userRef(8));
  }

  @Test
  void mudaQuandoOSegredoMuda() {
    Pseudonymizer other = new Pseudonymizer("outro-segredo-de-teste-para-pseudonimos-9876543210");

    assertThat(other.emailRef("ana@example.com"))
        .isNotEqualTo(pseudonymizer.emailRef("ana@example.com"));
  }

  @Test
  void emailEhNormalizadoPorCaixaEEspacos() {
    assertThat(pseudonymizer.emailRef("  Ana@Example.COM "))
        .isEqualTo(pseudonymizer.emailRef("ana@example.com"));
  }

  @Test
  void dominiosSaoIsolados() {
    Set<String> refs = new HashSet<>();
    for (Domain domain : EnumSet.allOf(Domain.class)) {
      refs.add(pseudonymizer.ref(domain, "a"));
    }

    assertThat(refs).hasSize(Domain.values().length);
    assertThat(pseudonymizer.ref(Domain.USER, "a"))
        .isNotEqualTo(pseudonymizer.ref(Domain.EMAIL, "a"));
  }

  @Test
  void valorComDoisPontosNaoForjaOutroDominio() {
    assertThat(pseudonymizer.ref(Domain.USER, "EMAIL:a"))
        .isNotEqualTo(pseudonymizer.ref(Domain.EMAIL, "a"));
    assertThat(pseudonymizer.ref(Domain.USER, "1:2"))
        .isNotEqualTo(pseudonymizer.ref(Domain.USER, "1"));
  }

  @Test
  void rotuloAnonimoTemOitoHexadecimaisDoHashDoUsuario() {
    String label = pseudonymizer.anonymousLabel(42);

    assertThat(label).matches("anônimo-[0-9a-f]{8}");
    assertThat(label).isEqualTo("anônimo-" + pseudonymizer.userRef(42).substring(0, 8));
  }

  @Test
  void chaveDeDeduplicacaoDependeDeTodasAsPartesEDaOrdem() {
    String key = pseudonymizer.dedupeKey("1", "10.0.0.1", "2", "ACCESS_DENIED");

    assertThat(key).hasSize(32);
    assertThat(pseudonymizer.dedupeKey("1", "10.0.0.1", "2", "ACCESS_DENIED")).isEqualTo(key);
    assertThat(pseudonymizer.dedupeKey("1", "10.0.0.2", "2", "ACCESS_DENIED")).isNotEqualTo(key);
    assertThat(pseudonymizer.dedupeKey("2", "10.0.0.1", "1", "ACCESS_DENIED")).isNotEqualTo(key);
  }

  @Test
  void hashDoCodigoTemSessentaEQuatroHexadecimaisEDependeDoPedido() {
    String hash = pseudonymizer.codeHash(5, "123456");

    assertThat(hash).hasSize(64).matches("[0-9a-f]{64}");
    assertThat(pseudonymizer.codeHash(5, "123456")).isEqualTo(hash);
    assertThat(pseudonymizer.codeHash(6, "123456")).isNotEqualTo(hash);
    assertThat(pseudonymizer.codeHash(5, "654321")).isNotEqualTo(hash);
  }

  @Test
  void naoRevelaOSegredoNemOsValoresNoToString() {
    assertThat(pseudonymizer.toString()).isEqualTo("Pseudonymizer[REDACTED]");
  }

  @Test
  void recusaSegredoNuloOuComMenosDe32Bytes() {
    assertThatThrownBy(() -> new Pseudonymizer((String) null))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new Pseudonymizer("curto"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("32");
  }

  @Test
  void contaBytesEmUtf8NaoCaracteres() {
    // 16 caracteres, 32 bytes em UTF-8.
    assertThat(new Pseudonymizer("ãããããããããããããããã").userRef(1)).hasSize(32);
  }
}
