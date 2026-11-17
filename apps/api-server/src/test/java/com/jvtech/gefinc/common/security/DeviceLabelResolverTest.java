package com.jvtech.gefinc.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DeviceLabelResolverTest {

  private static final String CHROME_WINDOWS =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
          + " Chrome/124.0.0.0 Safari/537.36";
  private static final String EDGE_WINDOWS = CHROME_WINDOWS + " Edg/124.0.2478.67";
  private static final String OPERA_WINDOWS = CHROME_WINDOWS + " OPR/110.0.0.0";
  private static final String FIREFOX_LINUX =
      "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0";
  private static final String SAFARI_MAC =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"
          + " Version/17.4 Safari/605.1.15";
  private static final String SAFARI_IPHONE =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like"
          + " Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  private static final String CHROME_IOS =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like"
          + " Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1";
  private static final String FIREFOX_IOS =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like"
          + " Gecko) FxiOS/125.0 Mobile/15E148 Safari/605.1.15";
  private static final String CHROME_ANDROID =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko)"
          + " Chrome/124.0.0.0 Mobile Safari/537.36";
  private static final String CHROME_OS =
      "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko)"
          + " Chrome/124.0.0.0 Safari/537.36";
  private static final String IPAD_APP =
      "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)"
          + " Mobile/15E148";

  private final DeviceLabelResolver resolver = new DeviceLabelResolver();

  @Test
  void navegadoresNoWebSaoRotuladosComNavegadorESistema() {
    assertThat(resolver.label(CHROME_WINDOWS, "web")).isEqualTo("Chrome em Windows");
    assertThat(resolver.label(EDGE_WINDOWS, "web")).isEqualTo("Edge em Windows");
    assertThat(resolver.label(OPERA_WINDOWS, "web")).isEqualTo("Opera em Windows");
    assertThat(resolver.label(FIREFOX_LINUX, "web")).isEqualTo("Firefox em Linux");
    assertThat(resolver.label(SAFARI_MAC, "web")).isEqualTo("Safari em macOS");
    assertThat(resolver.label(SAFARI_IPHONE, "web")).isEqualTo("Safari em iPhone");
    assertThat(resolver.label(CHROME_IOS, "web")).isEqualTo("Chrome em iPhone");
    assertThat(resolver.label(FIREFOX_IOS, "web")).isEqualTo("Firefox em iPhone");
    assertThat(resolver.label(CHROME_ANDROID, "web")).isEqualTo("Chrome em Android");
    assertThat(resolver.label(CHROME_OS, "web")).isEqualTo("Chrome em ChromeOS");
  }

  @Test
  void semXClientWebComAndroidOuIosEhOAplicativo() {
    assertThat(resolver.label(CHROME_ANDROID, null)).isEqualTo("Aplicativo Android");
    assertThat(resolver.label(IPAD_APP, null)).isEqualTo("Aplicativo iOS");
    assertThat(resolver.label(SAFARI_IPHONE, "")).isEqualTo("Aplicativo iOS");
  }

  @Test
  void tipoDeClienteSegueOXClientEOAgente() {
    assertThat(resolver.clientKind("web", CHROME_WINDOWS)).isEqualTo("WEB");
    assertThat(resolver.clientKind("WEB", null)).isEqualTo("WEB");
    assertThat(resolver.clientKind(null, CHROME_ANDROID)).isEqualTo("MOBILE");
    assertThat(resolver.clientKind(null, IPAD_APP)).isEqualTo("MOBILE");
    assertThat(resolver.clientKind(null, CHROME_WINDOWS)).isEqualTo("OTHER");
    assertThat(resolver.clientKind(null, null)).isEqualTo("OTHER");
    assertThat(resolver.clientKind("curl", null)).isEqualTo("OTHER");
  }

  @Test
  void agenteDesconhecidoOuVazioViraDispositivoDesconhecido() {
    assertThat(resolver.label(null, null)).isEqualTo("Dispositivo desconhecido");
    assertThat(resolver.label("", "web")).isEqualTo("Dispositivo desconhecido");
    assertThat(resolver.label("   ", null)).isEqualTo("Dispositivo desconhecido");
    assertThat(resolver.label("curl/8.5.0", null)).isEqualTo("Dispositivo desconhecido");
    assertThat(resolver.label("curl/8.5.0", "web")).isEqualTo("Dispositivo desconhecido");
  }

  @Test
  void navegadorSemSistemaReconhecidoUsaApenasONavegador() {
    assertThat(resolver.label("Mozilla/5.0 Firefox/125.0", "web")).isEqualTo("Firefox");
  }

  @Test
  void agenteGiganteEhLimitadoENaoGeraRotuloLongo() {
    String giant = CHROME_WINDOWS + " " + "x".repeat(100_000);

    String label = resolver.label(giant, "web");

    assertThat(label).hasSizeLessThanOrEqualTo(80).isEqualTo("Chrome em Windows");
  }

  @Test
  void nuncaDevolveOAgenteBrutoNemCaracteresDeControle() {
    String malicious = "Mozilla/5.0 \n\r\t(Windows NT 10.0) Chrome/124 <script>alert(1)</script>";

    String label = resolver.label(malicious, "web");

    assertThat(label).isEqualTo("Chrome em Windows");
    assertThat(label).doesNotContain("<").doesNotContain("Mozilla").doesNotContain("\n");
    assertThat(resolver.label(CHROME_WINDOWS, "web"))
        .doesNotContain("Mozilla")
        .doesNotContain("537");
  }
}
