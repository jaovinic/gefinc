package com.jvtech.gefinc.support;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;

/** Relógio controlável para testes determinísticos. */
public class MutableClock extends Clock {

  private Instant now;
  private final ZoneId zone;

  public MutableClock(Instant start, ZoneId zone) {
    this.now = start;
    this.zone = zone;
  }

  public MutableClock(Instant start) {
    this(start, ZoneId.of("America/Sao_Paulo"));
  }

  public void advance(Duration duration) {
    now = now.plus(duration);
  }

  public void set(Instant instant) {
    now = instant;
  }

  @Override
  public ZoneId getZone() {
    return zone;
  }

  @Override
  public Clock withZone(ZoneId zone) {
    return new MutableClock(now, zone);
  }

  @Override
  public Instant instant() {
    return now;
  }
}
