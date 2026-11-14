package com.jvtech.gefinc.common.mail;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class MailRejectedExecutionHandlerTest {

  private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
  private final CountDownLatch release = new CountDownLatch(1);
  private ThreadPoolExecutor pool;
  private ListAppender<ILoggingEvent> appender;
  private Logger logger;

  @BeforeEach
  void init() {
    pool =
        new ThreadPoolExecutor(
            1,
            1,
            0,
            TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(1),
            new MailRejectedExecutionHandler(new MailMetrics(registry)));
    logger = (Logger) LoggerFactory.getLogger(MailRejectedExecutionHandler.class);
    appender = new ListAppender<>();
    appender.start();
    logger.addAppender(appender);
  }

  @AfterEach
  void cleanup() {
    release.countDown();
    pool.shutdownNow();
    logger.detachAppender(appender);
  }

  private void block() {
    try {
      release.await(10, TimeUnit.SECONDS);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  private double drops(String reason) {
    return registry.counter(MailMetrics.DROPPED, "reason", reason).count();
  }

  private List<ILoggingEvent> warnings() {
    return appender.list.stream().filter(e -> e.getLevel() == Level.WARN).toList();
  }

  @Test
  void descartaComAvisoEContaQuandoAFilaEstaCheia() {
    pool.execute(this::block); // ocupa a única thread
    pool.execute(this::block); // ocupa a única vaga da fila

    pool.execute(this::block); // rejeitada

    assertThat(drops("queue_full")).isEqualTo(1);
    assertThat(drops("shutdown")).isZero();
    assertThat(warnings()).hasSize(1);
    assertThat(warnings().get(0).getFormattedMessage())
        .contains("fila de envio cheia")
        .doesNotContain("@")
        .doesNotContain("token");
  }

  @Test
  void descartaComAvisoEContaQuandoOPoolEstaEmShutdown() {
    pool.shutdown();

    pool.execute(this::block);

    assertThat(drops("shutdown")).isEqualTo(1);
    assertThat(drops("queue_full")).isZero();
    assertThat(warnings()).hasSize(1);
    assertThat(warnings().get(0).getFormattedMessage())
        .contains("encerramento")
        .doesNotContain("@")
        .doesNotContain("token");
  }
}
