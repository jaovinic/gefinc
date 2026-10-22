package com.jvtech.gefinc.common.config;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** {@link Clock} injetável: "hoje" usa o fuso de negócio e os testes podem fixar o tempo. */
@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class ClockConfig {

  @Bean
  Clock clock(AppProperties properties) {
    return Clock.system(ZoneId.of(properties.timezone()));
  }
}
