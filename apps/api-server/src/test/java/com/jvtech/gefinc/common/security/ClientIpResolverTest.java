package com.jvtech.gefinc.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ClientIpResolverTest {

  private static final String TUNNEL = "172.28.0.10";
  private static final String HEADER = "CF-Connecting-IP";

  private final ClientIpResolver resolver = new ClientIpResolver(List.of("172.28.0.10/32"), HEADER);

  private static MockHttpServletRequest from(String peer) {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setRemoteAddr(peer);
    return request;
  }

  @Test
  void proxyConfiavelComCabecalhoValidoInformaOIpReal() {
    MockHttpServletRequest request = from(TUNNEL);
    request.addHeader(HEADER, "203.0.113.7");

    assertThat(resolver.resolve(request)).isEqualTo("203.0.113.7");
  }

  @Test
  void origemNaoConfiavelIgnoraOCabecalhoForjado() {
    MockHttpServletRequest request = from("198.51.100.9");
    request.addHeader(HEADER, "203.0.113.7");

    assertThat(resolver.resolve(request)).isEqualTo("198.51.100.9");
  }

  @Test
  void listaVaziaNuncaConfia() {
    ClientIpResolver none = new ClientIpResolver(List.of(), HEADER);
    MockHttpServletRequest request = from(TUNNEL);
    request.addHeader(HEADER, "203.0.113.7");

    assertThat(none.resolve(request)).isEqualTo(TUNNEL);
  }

  @Test
  void entradaEmBrancoNaListaEhIgnorada() {
    ClientIpResolver blank = new ClientIpResolver(List.of("", "  "), HEADER);
    MockHttpServletRequest request = from(TUNNEL);
    request.addHeader(HEADER, "203.0.113.7");

    assertThat(blank.resolve(request)).isEqualTo(TUNNEL);
  }

  @Test
  void listaNulaNuncaConfia() {
    ClientIpResolver none = new ClientIpResolver(null, HEADER);
    MockHttpServletRequest request = from(TUNNEL);
    request.addHeader(HEADER, "203.0.113.7");

    assertThat(none.resolve(request)).isEqualTo(TUNNEL);
  }

  @Test
  void valoresInvalidosCaemNoIpDaConexao() {
    for (String invalid :
        List.of(
            "abc",
            "999.1.1.1",
            "1.2.3.4, 5.6.7.8",
            "1.2.3",
            "",
            "   ",
            "example.com",
            "1.2.3.4.5",
            "fe80::1%eth0",
            "localhost",
            "1.2.3.4\n5.6.7.8")) {
      MockHttpServletRequest request = from(TUNNEL);
      request.addHeader(HEADER, invalid);

      assertThat(resolver.resolve(request)).as("valor %s", invalid).isEqualTo(TUNNEL);
    }
  }

  @Test
  void cabecalhoRepetidoCaiNoIpDaConexao() {
    MockHttpServletRequest request = from(TUNNEL);
    request.addHeader(HEADER, "203.0.113.7");
    request.addHeader(HEADER, "203.0.113.8");

    assertThat(resolver.resolve(request)).isEqualTo(TUNNEL);
  }

  @Test
  void cabecalhoAusenteCaiNoIpDaConexao() {
    assertThat(resolver.resolve(from(TUNNEL))).isEqualTo(TUNNEL);
  }

  @Test
  void ipv6EhCanonicalizadoEmMinusculasExpandido() {
    MockHttpServletRequest request = from(TUNNEL);
    request.addHeader(HEADER, "2001:DB8::1");

    assertThat(resolver.resolve(request)).isEqualTo("2001:db8:0:0:0:0:0:1");
  }

  @Test
  void ipv4MapeadoViraIpv4() {
    MockHttpServletRequest request = from(TUNNEL);
    request.addHeader(HEADER, "::ffff:203.0.113.7");

    assertThat(resolver.resolve(request)).isEqualTo("203.0.113.7");
  }

  @Test
  void xForwardedForNuncaEhLido() {
    MockHttpServletRequest request = from(TUNNEL);
    request.addHeader("X-Forwarded-For", "203.0.113.7");

    assertThat(resolver.resolve(request)).isEqualTo(TUNNEL);

    MockHttpServletRequest outsider = from("198.51.100.9");
    outsider.addHeader("X-Forwarded-For", "203.0.113.7");
    assertThat(resolver.resolve(outsider)).isEqualTo("198.51.100.9");
  }

  @Test
  void cidr24CasaTodaAFaixaE32SoOEndereco() {
    ClientIpResolver range = new ClientIpResolver(List.of("10.1.2.0/24"), HEADER);
    MockHttpServletRequest inside = from("10.1.2.200");
    inside.addHeader(HEADER, "203.0.113.7");
    MockHttpServletRequest outside = from("10.1.3.1");
    outside.addHeader(HEADER, "203.0.113.7");

    assertThat(range.resolve(inside)).isEqualTo("203.0.113.7");
    assertThat(range.resolve(outside)).isEqualTo("10.1.3.1");

    MockHttpServletRequest neighbour = from("172.28.0.11");
    neighbour.addHeader(HEADER, "203.0.113.7");
    assertThat(resolver.resolve(neighbour)).isEqualTo("172.28.0.11");
  }

  @Test
  void cidrIpv6NaoCasaIpv4EViceVersa() {
    ClientIpResolver v6 = new ClientIpResolver(List.of("fd00::/8"), HEADER);
    MockHttpServletRequest v4Peer = from(TUNNEL);
    v4Peer.addHeader(HEADER, "203.0.113.7");
    MockHttpServletRequest v6Peer = from("fd12:3456::1");
    v6Peer.addHeader(HEADER, "203.0.113.7");

    assertThat(v6.resolve(v4Peer)).isEqualTo(TUNNEL);
    assertThat(v6.resolve(v6Peer)).isEqualTo("203.0.113.7");
  }

  @Test
  void cidrInvalidoFalhaNaConstrucao() {
    for (String invalid :
        List.of("172.28.0.10", "172.28.0.10/33", "abc/8", "10.0.0.0/-1", "10.0.0.0/x")) {
      assertThatThrownBy(() -> new ClientIpResolver(List.of(invalid), HEADER))
          .as("cidr %s", invalid)
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void nomeDoCabecalhoEConfiguravel() {
    ClientIpResolver custom = new ClientIpResolver(List.of("172.28.0.10/32"), "X-Real-Client");
    MockHttpServletRequest request = from(TUNNEL);
    request.addHeader("X-Real-Client", "203.0.113.7");
    request.addHeader(HEADER, "198.51.100.1");

    assertThat(custom.resolve(request)).isEqualTo("203.0.113.7");
  }

  @Test
  void enderecoDaConexaoInvalidoNuncaDevolveNulo() {
    MockHttpServletRequest request = from("unknown-host");

    assertThat(resolver.resolve(request)).isNotNull();
  }
}
