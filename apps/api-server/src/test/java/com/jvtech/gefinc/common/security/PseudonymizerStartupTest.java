package com.jvtech.gefinc.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.common.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * O segredo do HMAC é obrigatório: sem ele, curto ou igual ao do JWT a aplicação não sobe (falha
 * rápida, nunca um valor padrão fraco).
 */
class PseudonymizerStartupTest {

  private static final String JWT = "segredo-do-jwt-de-teste-com-pelo-menos-32-caracteres";
  private static final String VALID = "segredo-de-pseudonimizacao-so-para-testes-0123456789";

  @Configuration
  @EnableConfigurationProperties(AppProperties.class)
  static class Config {
    @Bean
    Pseudonymizer pseudonymizer(AppProperties properties) {
      return new Pseudonymizer(properties);
    }
  }

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner().withUserConfiguration(Config.class);

  @Test
  void sobeComSegredoValidoDistintoDoJwt() {
    runner
        .withPropertyValues("app.pseudonym-secret=" + VALID, "app.security.jwt-secret=" + JWT)
        .run(context -> assertThat(context).hasNotFailed());
  }

  @Test
  void falhaSemSegredo() {
    runner
        .withPropertyValues("app.security.jwt-secret=" + JWT)
        .run(context -> assertThat(context).hasFailed());
  }

  @Test
  void falhaComSegredoCurto() {
    runner
        .withPropertyValues("app.pseudonym-secret=curto", "app.security.jwt-secret=" + JWT)
        .run(context -> assertThat(context).hasFailed());
  }

  @Test
  void falhaQuandoIgualAoSegredoDoJwt() {
    runner
        .withPropertyValues("app.pseudonym-secret=" + JWT, "app.security.jwt-secret=" + JWT)
        .run(context -> assertThat(context).hasFailed());
  }

  @Test
  void aFalhaNaoRevelaOSegredo() {
    runner
        .withPropertyValues(
            "app.pseudonym-secret=curto-" + "x".repeat(3), "app.security.jwt-secret=" + JWT)
        .run(
            context -> {
              assertThat(context).hasFailed();
              assertThat(String.valueOf(context.getStartupFailure())).doesNotContain("curto-xxx");
            });
  }

  @Test
  void oApplicationYmlNaoTemValorPadraoParaOSegredo() {
    new ApplicationContextRunner()
        .withUserConfiguration(Config.class)
        .withInitializer(new ConfigDataApplicationContextInitializer())
        .withPropertyValues("JWT_SECRET=" + JWT)
        .run(context -> assertThat(context).hasFailed());
  }

  @Test
  void oApplicationYmlLeOSegredoDaVariavelDeAmbiente() {
    new ApplicationContextRunner()
        .withUserConfiguration(Config.class)
        .withInitializer(new ConfigDataApplicationContextInitializer())
        .withPropertyValues("JWT_SECRET=" + JWT, "PSEUDONYM_SECRET=" + VALID)
        .run(context -> assertThat(context).hasNotFailed());
  }
}
