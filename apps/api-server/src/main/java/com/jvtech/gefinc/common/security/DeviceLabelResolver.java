package com.jvtech.gefinc.common.security;

import org.springframework.stereotype.Component;

/**
 * Converte o {@code User-Agent} em um rótulo grosseiro ("Chrome em Windows", "Aplicativo Android").
 * O agente bruto nunca é devolvido nem guardado: ele identifica o aparelho com precisão demais para
 * uma tela administrativa. O web envia {@code X-Client: web}; o aplicativo móvel não envia o
 * cabeçalho.
 */
@Component
public class DeviceLabelResolver {

  static final String UNKNOWN = "Dispositivo desconhecido";
  private static final int MAX_INPUT = 512;
  private static final String WEB = "web";

  /** Rótulo de até 80 caracteres; nunca o agente bruto. */
  public String label(String userAgent, String xClient) {
    String ua = sanitize(userAgent);
    String os = operatingSystem(ua);
    boolean web = isWeb(xClient);
    if (!web && ("Android".equals(os) || "iPhone".equals(os) || "iPad".equals(os))) {
      return "Android".equals(os) ? "Aplicativo Android" : "Aplicativo iOS";
    }
    String browser = browser(ua);
    if (browser == null) {
      return web && os != null ? "Navegador em " + os : UNKNOWN;
    }
    return os == null ? browser : browser + " em " + os;
  }

  /** {@code WEB}, {@code MOBILE} (aplicativo, sem {@code X-Client: web}) ou {@code OTHER}. */
  public String clientKind(String xClient, String userAgent) {
    if (isWeb(xClient)) {
      return "WEB";
    }
    String os = operatingSystem(sanitize(userAgent));
    if ("Android".equals(os) || "iPhone".equals(os) || "iPad".equals(os)) {
      return "MOBILE";
    }
    return "OTHER";
  }

  private static boolean isWeb(String xClient) {
    return xClient != null && WEB.equalsIgnoreCase(xClient.strip());
  }

  private static String sanitize(String userAgent) {
    if (userAgent == null) {
      return "";
    }
    String limited = userAgent.length() > MAX_INPUT ? userAgent.substring(0, MAX_INPUT) : userAgent;
    StringBuilder clean = new StringBuilder(limited.length());
    for (int i = 0; i < limited.length(); i++) {
      char c = limited.charAt(i);
      clean.append(Character.isISOControl(c) ? ' ' : c);
    }
    return clean.toString().strip();
  }

  private static String browser(String ua) {
    if (ua.contains("Edg/") || ua.contains("EdgA/") || ua.contains("EdgiOS/")) {
      return "Edge";
    }
    if (ua.contains("OPR/")) {
      return "Opera";
    }
    if (ua.contains("Firefox/") || ua.contains("FxiOS")) {
      return "Firefox";
    }
    if (ua.contains("Chrome/") || ua.contains("CriOS")) {
      return "Chrome";
    }
    if (ua.contains("Safari/")) {
      return "Safari";
    }
    return null;
  }

  private static String operatingSystem(String ua) {
    if (ua.contains("Android")) {
      return "Android";
    }
    if (ua.contains("iPhone")) {
      return "iPhone";
    }
    if (ua.contains("iPad")) {
      return "iPad";
    }
    if (ua.contains("CrOS")) {
      return "ChromeOS";
    }
    if (ua.contains("Windows")) {
      return "Windows";
    }
    if (ua.contains("Macintosh") || ua.contains("Mac OS X")) {
      return "macOS";
    }
    if (ua.contains("Linux") || ua.contains("X11")) {
      return "Linux";
    }
    return null;
  }
}
