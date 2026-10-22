package com.jvtech.gefinc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class GefincApplication {

  public static void main(String[] args) {
    SpringApplication.run(GefincApplication.class, args);
  }
}
