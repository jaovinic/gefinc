package com.jvtech.gefinc.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;

/** Lê as claims de um token de acesso JWT dos testes (sem validar a assinatura). */
public final class TestTokens {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private TestTokens() {}

  /** Claim {@code sid} (a sessão), ou nulo se o token não a traz. */
  public static UUID sessionId(String accessToken) throws Exception {
    JsonNode sid = payload(accessToken).get("sid");
    return sid == null ? null : UUID.fromString(sid.asText());
  }

  public static JsonNode payload(String accessToken) throws Exception {
    String body = accessToken.split("\\.")[1];
    return MAPPER.readTree(new String(Base64.getUrlDecoder().decode(body), StandardCharsets.UTF_8));
  }
}
