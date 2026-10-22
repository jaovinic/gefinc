package com.jvtech.gefinc.support;

import java.time.Instant;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Substitui o relógio da aplicação por um {@link MutableClock} controlável nos testes. */
@TestConfiguration
public class TestClockConfig {

  public static final Instant START = Instant.parse("2026-11-10T15:00:00Z");

  @Bean
  @Primary
  MutableClock testClock() {
    return new MutableClock(START);
  }
}
