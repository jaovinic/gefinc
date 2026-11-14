package com.jvtech.gefinc.common.mail;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.Locale;
import org.springframework.stereotype.Component;

/**
 * Contadores internos do envio de e-mail (Micrometer, já presente via actuator). Só rótulos de
 * baixa cardinalidade e sem dados pessoais: nunca o destinatário, o link ou segredos. O actuator
 * expõe apenas {@code health} e {@code info}, então os contadores não saem da aplicação.
 */
@Component
public class MailMetrics {

  public static final String DROPPED = "gefinc.mail.dropped";
  public static final String FAILED = "gefinc.mail.failed";

  /** Motivo do descarte antes do envio. */
  public enum DropReason {
    QUEUE_FULL,
    SHUTDOWN
  }

  /** Motivo da falha final do envio. */
  public enum FailureReason {
    PERMANENT_REJECTION,
    AUTHENTICATION,
    RETRIES_EXHAUSTED,
    OTHER,
    INTERRUPTED
  }

  private final MeterRegistry registry;

  public MailMetrics(MeterRegistry registry) {
    this.registry = registry;
  }

  public void dropped(DropReason reason) {
    registry.counter(DROPPED, "reason", tag(reason)).increment();
  }

  public void failed(FailureReason reason) {
    registry.counter(FAILED, "reason", tag(reason)).increment();
  }

  private static String tag(Enum<?> reason) {
    return reason.name().toLowerCase(Locale.ROOT);
  }
}
