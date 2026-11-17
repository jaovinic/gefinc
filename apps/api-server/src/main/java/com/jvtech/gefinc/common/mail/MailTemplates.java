package com.jvtech.gefinc.common.mail;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;

/**
 * Modelos de e-mail em texto ({@code mail/<nome>.txt}) com marcadores {@code {{nome}}}. A
 * renderização é estrita: todo marcador do modelo precisa de valor e não pode sobrar valor sem
 * marcador, o que evita e-mail enviado com {@code {{...}}} cru ou com conteúdo esquecido. Os
 * valores entram como texto puro (um valor com {@code {{x}}} ou {@code $1} não é reinterpretado).
 * Nenhum modelo recebe justificativa livre do administrador.
 */
public final class MailTemplates {

  private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\s*([A-Za-z0-9_]+)\\s*}}");
  private static final Map<String, String> CACHE = new ConcurrentHashMap<>();

  private MailTemplates() {}

  public static String render(String name, Map<String, String> values) {
    String template = load(name);
    Set<String> declared = placeholdersOf(template);
    for (String key : declared) {
      if (!values.containsKey(key) || values.get(key) == null) {
        throw new IllegalArgumentException(
            "Modelo de e-mail '" + name + "': falta o valor do marcador '" + key + "'.");
      }
    }
    for (String key : values.keySet()) {
      if (!declared.contains(key)) {
        throw new IllegalArgumentException(
            "Modelo de e-mail '" + name + "': o marcador '" + key + "' não existe no modelo.");
      }
    }
    Matcher matcher = PLACEHOLDER.matcher(template);
    StringBuilder out = new StringBuilder();
    while (matcher.find()) {
      matcher.appendReplacement(out, Matcher.quoteReplacement(values.get(matcher.group(1))));
    }
    matcher.appendTail(out);
    return out.toString();
  }

  /** Marcadores declarados no modelo (usado pelos testes de conformidade). */
  static Set<String> placeholders(String name) {
    return placeholdersOf(load(name));
  }

  private static Set<String> placeholdersOf(String template) {
    Set<String> names = new TreeSet<>();
    Matcher matcher = PLACEHOLDER.matcher(template);
    while (matcher.find()) {
      names.add(matcher.group(1));
    }
    return names;
  }

  private static String load(String name) {
    return CACHE.computeIfAbsent(
        name,
        key -> {
          if (!key.matches("[a-z0-9-]+")) {
            throw new IllegalArgumentException("Nome de modelo de e-mail inválido.");
          }
          try {
            return new String(
                new ClassPathResource("mail/" + key + ".txt").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8);
          } catch (IOException e) {
            throw new IllegalArgumentException("Modelo de e-mail '" + key + "' não encontrado.", e);
          }
        });
  }
}
