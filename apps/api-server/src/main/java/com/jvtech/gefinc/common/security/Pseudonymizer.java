package com.jvtech.gefinc.common.security;

import com.jvtech.gefinc.common.config.AppProperties;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;
import java.util.Locale;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Pseudonimização por HMAC-SHA256 com chave só de ambiente. Gera referências estáveis (auditoria,
 * histórico de envios, chaves de deduplicação) que permitem correlacionar sem guardar o dado:
 * e-mail, nome e IP nunca são recuperáveis a partir delas.
 *
 * <p>Cada domínio ({@link Domain}) entra no texto assinado como {@code "<DOMINIO>:valor"}; as tags
 * são fechadas e sem {@code :}, então um valor com {@code :} não colide com outro domínio. As
 * referências usam os 16 primeiros bytes (32 caracteres hexadecimais); o hash de código usa os 32
 * bytes. Trocar a chave interrompe a correlação com o que foi gravado antes, mas não expõe dados.
 */
@Component
public class Pseudonymizer {

  private static final String ALGORITHM = "HmacSHA256";
  private static final int MIN_SECRET_BYTES = 32;
  private static final int REF_BYTES = 16;
  private static final int LABEL_HEX = 8;

  /** Domínios isolados: o mesmo valor gera referências diferentes em cada um. */
  public enum Domain {
    USER,
    EMAIL,
    NAME,
    IP,
    DEDUPE,
    CODE
  }

  private final SecretKeySpec key;

  @Autowired
  public Pseudonymizer(AppProperties properties) {
    this(requireDistinct(properties));
  }

  public Pseudonymizer(String secret) {
    if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
      throw new IllegalArgumentException(
          "A chave de pseudonimização deve ter pelo menos " + MIN_SECRET_BYTES + " bytes.");
    }
    this.key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), ALGORITHM);
  }

  private static String requireDistinct(AppProperties properties) {
    String secret = properties.pseudonymSecret();
    if (properties.security() != null
        && secret != null
        && secret.equals(properties.security().jwtSecret())) {
      throw new IllegalArgumentException(
          "A chave de pseudonimização deve ser distinta da chave de assinatura do JWT.");
    }
    return secret;
  }

  /** Referência de 32 caracteres hexadecimais do valor no domínio. */
  public String ref(Domain domain, String value) {
    return hex(sign(domain, value), REF_BYTES);
  }

  public String userRef(long id) {
    return ref(Domain.USER, Long.toString(id));
  }

  /** O e-mail é normalizado (sem espaços nas pontas, minúsculas) antes de assinar. */
  public String emailRef(String email) {
    return ref(Domain.EMAIL, email.strip().toLowerCase(Locale.ROOT));
  }

  public String nameRef(String name) {
    return ref(Domain.NAME, name.strip());
  }

  /** O IP deve vir canônico (ver {@link ClientIpResolver}). */
  public String ipRef(String canonicalIp) {
    return ref(Domain.IP, canonicalIp);
  }

  /** Chave de deduplicação: as partes, na ordem, unidas por {@code |}. */
  public String dedupeKey(String... parts) {
    return ref(Domain.DEDUPE, String.join("|", parts));
  }

  /** HMAC completo (64 hexadecimais) do código de confirmação, vinculado ao pedido. */
  public String codeHash(long requestId, String code) {
    return hex(sign(Domain.CODE, requestId + ":" + code), 32);
  }

  /** Rótulo exibido no lugar de uma conta que já não existe: {@code anônimo-} e 8 hexadecimais. */
  public String anonymousLabel(long userId) {
    return "anônimo-" + userRef(userId).substring(0, LABEL_HEX);
  }

  private byte[] sign(Domain domain, String value) {
    try {
      // Um Mac por chamada: a instância não é thread-safe.
      Mac mac = Mac.getInstance(ALGORITHM);
      mac.init(key);
      return mac.doFinal((domain.name() + ":" + value).getBytes(StandardCharsets.UTF_8));
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException("HMAC-SHA256 indisponível", e);
    }
  }

  private static String hex(byte[] bytes, int length) {
    return HexFormat.of().formatHex(bytes, 0, length);
  }

  @Override
  public String toString() {
    return "Pseudonymizer[REDACTED]";
  }
}
