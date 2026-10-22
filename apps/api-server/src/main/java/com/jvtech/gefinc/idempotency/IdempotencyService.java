package com.jvtech.gefinc.idempotency;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Controle das chaves de idempotência (tabela {@code idempotency_keys}). Cada método confirma a
 * transação ao terminar, para que requisições simultâneas com a mesma chave enxerguem a reserva.
 */
@Service
public class IdempotencyService {

  /** Por quanto tempo uma resposta guardada pode ser repetida. */
  public static final Duration RETENTION = Duration.ofDays(7);

  /** Reserva sem conclusão há mais que isso é considerada abandonada (processo caiu no meio). */
  static final Duration STALE_IN_PROGRESS = Duration.ofMinutes(2);

  /** Resultado da tentativa de reservar a chave. */
  public sealed interface Outcome permits Started, Replay, InProgress, KeyReused {}

  /** Chave nova: a requisição deve ser executada. */
  public record Started() implements Outcome {}

  /** Chave já concluída com o mesmo pedido: devolver a resposta guardada. */
  public record Replay(int status, String body) implements Outcome {
    /** Sem dados do usuário em logs: o corpo nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "Replay[REDACTED]";
    }
  }

  /** Outra requisição com a mesma chave ainda está sendo processada. */
  public record InProgress() implements Outcome {}

  /** A chave já foi usada com outro caminho ou outro corpo. */
  public record KeyReused() implements Outcome {}

  private final JdbcTemplate jdbc;
  private final Clock clock;

  public IdempotencyService(JdbcTemplate jdbc, Clock clock) {
    this.jdbc = jdbc;
    this.clock = clock;
  }

  @Transactional
  public Outcome begin(long userId, UUID key, String method, String path, String requestHash) {
    Timestamp now = Timestamp.from(clock.instant());
    jdbc.update(
        "DELETE FROM idempotency_keys WHERE user_id = ? AND key = ?::uuid"
            + " AND state = 'IN_PROGRESS' AND created_at < ?",
        userId,
        key.toString(),
        Timestamp.from(clock.instant().minus(STALE_IN_PROGRESS)));
    int inserted =
        jdbc.update(
            "INSERT INTO idempotency_keys (user_id, key, method, path, request_hash, state,"
                + " created_at) VALUES (?, ?::uuid, ?, ?, ?, 'IN_PROGRESS', ?)"
                + " ON CONFLICT (user_id, key) DO NOTHING",
            userId,
            key.toString(),
            method,
            path,
            requestHash,
            now);
    if (inserted == 1) {
      return new Started();
    }
    List<Outcome> existing =
        jdbc.query(
            "SELECT path, request_hash, state, response_status, response_body"
                + " FROM idempotency_keys WHERE user_id = ? AND key = ?::uuid",
            (rs, row) -> {
              if (!rs.getString("path").equals(path)
                  || !rs.getString("request_hash").trim().equals(requestHash)) {
                return new KeyReused();
              }
              if ("COMPLETED".equals(rs.getString("state"))) {
                return new Replay(rs.getInt("response_status"), rs.getString("response_body"));
              }
              return new InProgress();
            },
            userId,
            key.toString());
    // A reserva pode ter sido removida entre o conflito e a leitura (falha 5xx da outra
    // requisição): quem chegou agora tenta de novo.
    return existing.isEmpty() ? begin(userId, key, method, path, requestHash) : existing.get(0);
  }

  @Transactional
  public void complete(long userId, UUID key, int status, String body) {
    jdbc.update(
        "UPDATE idempotency_keys SET state = 'COMPLETED', response_status = ?, response_body = ?"
            + " WHERE user_id = ? AND key = ?::uuid",
        status,
        body,
        userId,
        key.toString());
  }

  /** Libera a chave (falha inesperada) para a operação poder ser repetida. */
  @Transactional
  public void release(long userId, UUID key) {
    jdbc.update(
        "DELETE FROM idempotency_keys WHERE user_id = ? AND key = ?::uuid", userId, key.toString());
  }

  /** Apaga as chaves mais antigas que {@link #RETENTION}; devolve quantas foram removidas. */
  @Transactional
  public int purgeExpired() {
    return jdbc.update(
        "DELETE FROM idempotency_keys WHERE created_at < ?",
        Timestamp.from(clock.instant().minus(RETENTION)));
  }

  /** SHA-256 em hexadecimal do corpo da requisição. */
  public static String hash(byte[] body) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
