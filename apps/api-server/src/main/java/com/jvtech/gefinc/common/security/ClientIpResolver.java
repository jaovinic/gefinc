package com.jvtech.gefinc.common.security;

import com.jvtech.gefinc.common.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Determina o IP do cliente. Por padrão é o endereço da conexão. O cabeçalho do túnel (padrão
 * {@code CF-Connecting-IP}) só vale quando a conexão vem de um proxy listado em {@code
 * app.security.trusted-proxies}: um cliente que fale direto com a API não consegue forjar o IP.
 * {@code X-Forwarded-For} nunca é lido. Cabeçalho ausente, repetido ou que não seja um IP literal
 * válido faz o IP voltar ao da conexão. A validação é por expressão regular antes de qualquer
 * {@link InetAddress}, o que garante que nunca há consulta de DNS.
 */
@Component
public class ClientIpResolver {

  private static final Pattern IPV4 =
      Pattern.compile(
          "(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)");
  private static final Pattern IPV6 = Pattern.compile("[0-9a-fA-F:.]{2,45}");
  private static final String UNKNOWN = "unknown";

  private record Cidr(byte[] network, int prefix) {
    boolean contains(byte[] address) {
      if (address.length != network.length) {
        return false;
      }
      int fullBytes = prefix / 8;
      for (int i = 0; i < fullBytes; i++) {
        if (address[i] != network[i]) {
          return false;
        }
      }
      int rest = prefix % 8;
      if (rest == 0) {
        return true;
      }
      int mask = (0xFF << (8 - rest)) & 0xFF;
      return (address[fullBytes] & mask) == (network[fullBytes] & mask);
    }
  }

  private final List<Cidr> trusted;
  private final String header;

  @Autowired
  public ClientIpResolver(AppProperties properties) {
    this(properties.security().trustedProxies(), properties.security().clientIpHeader());
  }

  ClientIpResolver(List<String> cidrs, String header) {
    List<Cidr> parsed = new ArrayList<>();
    if (cidrs != null) {
      for (String cidr : cidrs) {
        if (cidr != null && !cidr.isBlank()) {
          parsed.add(parse(cidr.strip()));
        }
      }
    }
    this.trusted = List.copyOf(parsed);
    this.header = header == null || header.isBlank() ? "CF-Connecting-IP" : header.strip();
  }

  /** Nunca devolve nulo. */
  public String resolve(HttpServletRequest request) {
    String remote = request.getRemoteAddr();
    String peer = canonical(remote);
    if (peer == null) {
      return remote == null || remote.isBlank() ? UNKNOWN : remote;
    }
    if (trusted.isEmpty() || !isTrusted(peer)) {
      return peer;
    }
    Enumeration<String> values = request.getHeaders(header);
    if (values == null) {
      return peer;
    }
    List<String> lines = Collections.list(values);
    if (lines.size() != 1) {
      return peer;
    }
    String forwarded = canonical(lines.get(0));
    return forwarded == null ? peer : forwarded;
  }

  private boolean isTrusted(String canonicalPeer) {
    byte[] address = bytes(canonicalPeer);
    if (address == null) {
      return false;
    }
    for (Cidr cidr : trusted) {
      if (cidr.contains(address)) {
        return true;
      }
    }
    return false;
  }

  /** IP literal válido em forma canônica (IPv4 pontuado ou IPv6 expandido), ou nulo. */
  private static String canonical(String value) {
    if (value == null) {
      return null;
    }
    String text = value.strip();
    if (!isLiteral(text)) {
      return null;
    }
    try {
      return InetAddress.getByName(text).getHostAddress();
    } catch (UnknownHostException e) {
      return null;
    }
  }

  private static boolean isLiteral(String text) {
    if (text.isEmpty() || text.length() > 45) {
      return false;
    }
    if (text.indexOf(':') < 0) {
      return IPV4.matcher(text).matches();
    }
    return IPV6.matcher(text).matches();
  }

  private static byte[] bytes(String canonicalIp) {
    try {
      return InetAddress.getByName(canonicalIp).getAddress();
    } catch (UnknownHostException e) {
      return null;
    }
  }

  private static Cidr parse(String text) {
    int slash = text.indexOf('/');
    if (slash <= 0 || slash == text.length() - 1) {
      throw new IllegalArgumentException("CIDR inválido em app.security.trusted-proxies.");
    }
    String address = canonical(text.substring(0, slash));
    if (address == null) {
      throw new IllegalArgumentException("CIDR inválido em app.security.trusted-proxies.");
    }
    byte[] network = bytes(address);
    int prefix;
    try {
      prefix = Integer.parseInt(text.substring(slash + 1));
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException("CIDR inválido em app.security.trusted-proxies.", e);
    }
    if (network == null || prefix < 0 || prefix > network.length * 8) {
      throw new IllegalArgumentException("CIDR inválido em app.security.trusted-proxies.");
    }
    return new Cidr(network, prefix);
  }
}
