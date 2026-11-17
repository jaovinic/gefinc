package com.jvtech.gefinc.support;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Sementes do painel administrativo: espelha o que a migração V14 insere (guardado por {@code
 * AdminMigrationV14V15IT}) e as restaura depois do {@code TRUNCATE} que a base de testes faz entre
 * os testes, para que cada teste comece com os motivos de exclusão e os parâmetros iniciais.
 */
public final class AdminSeed {

  public record Reason(String name, String message) {}

  public static final List<Reason> DELETION_REASONS =
      List.of(
          new Reason(
              "Solicitação do titular dos dados",
              "A exclusão desta conta foi realizada a pedido do titular dos dados."),
          new Reason(
              "Violação dos termos de uso",
              "Esta conta foi excluída por descumprimento dos termos de uso do serviço."),
          new Reason(
              "Determinação legal ou de autoridade",
              "Esta conta foi excluída em cumprimento a uma determinação legal ou de autoridade"
                  + " competente."),
          new Reason(
              "Outros motivos administrativos",
              "Esta conta foi excluída por motivos administrativos. Para mais informações, procure"
                  + " o suporte."));

  public static final Map<String, String> PARAMETERS = parameters();

  private static Map<String, String> parameters() {
    Map<String, String> map = new LinkedHashMap<>();
    map.put("SIGNUPS_OPEN", "true");
    map.put("MAINTENANCE_ENABLED", "false");
    map.put("MAINTENANCE_MESSAGE", "");
    return Map.copyOf(map);
  }

  /** Usuário criado direto no banco; a senha é {@link TestUsers#PASSWORD}. */
  public record SeededUser(long id, String email) {}

  private final JdbcTemplate jdbc;
  private final PasswordEncoder encoder;
  private final TransactionTemplate transaction;

  public AdminSeed(
      JdbcTemplate jdbc, PasswordEncoder encoder, PlatformTransactionManager transactionManager) {
    this.jdbc = jdbc;
    this.encoder = encoder;
    this.transaction = new TransactionTemplate(transactionManager);
  }

  /** Recoloca as sementes (os ids dos motivos voltam a 1..4 por causa do RESTART IDENTITY). */
  public static void restore(JdbcTemplate jdbc) {
    PARAMETERS.forEach(
        (key, value) ->
            jdbc.update(
                "INSERT INTO system_parameters (key, value) VALUES (?, ?) ON CONFLICT DO NOTHING",
                key,
                value));
    for (Reason reason : DELETION_REASONS) {
      jdbc.update(
          "INSERT INTO deletion_reasons (name, message, active, initial) VALUES (?, ?, true, true)"
              + " ON CONFLICT DO NOTHING",
          reason.name(),
          reason.message());
    }
  }

  /** Usuário comum. Ignora o cadastro: sem categorias padrão (use {@code TestUsers} para isso). */
  public SeededUser createUser(String email) {
    return insert(email, "USER");
  }

  public SeededUser createAdmin(String email) {
    return insert(email, "ADMIN");
  }

  /** O raiz só nasce com a variável de transação que o gatilho exige (roteiro do dono). */
  public SeededUser createRoot(String email) {
    return transaction.execute(
        status -> {
          allowRootChange();
          return insert(email, "ROOT");
        });
  }

  public void promoteToRoot(String email) {
    transaction.executeWithoutResult(
        status -> {
          allowRootChange();
          jdbc.update("UPDATE users SET role = 'ROOT' WHERE lower(email) = lower(?)", email);
        });
  }

  /** Nome de exibição direto na coluna. */
  public void setName(long id, String name) {
    jdbc.update("UPDATE users SET name = ? WHERE id = ?", name, id);
  }

  /** Datas de criação e do último acesso direto nas colunas (o último acesso pode ser nulo). */
  public void setDates(long id, Instant createdAt, Instant lastAccessAt) {
    jdbc.update(
        "UPDATE users SET created_at = ?, last_access_at = ? WHERE id = ?",
        Timestamp.from(createdAt),
        lastAccessAt == null ? null : Timestamp.from(lastAccessAt),
        id);
  }

  /** Marca a conta como suspensa (só a coluna: a ação de suspender é outra história). */
  public void suspend(long id, Instant at) {
    jdbc.update("UPDATE users SET suspended_at = ? WHERE id = ?", Timestamp.from(at), id);
  }

  /**
   * Agenda a exclusão pedida pelo próprio usuário (30 dias), com o livro-razão e as quatro colunas
   * coerentes, como o autoatendimento deixa.
   */
  public void scheduleDeletion(long id, Instant requestedAt) {
    Instant dueAt = requestedAt.plus(Duration.ofDays(30));
    Long requestId =
        jdbc.queryForObject(
            "INSERT INTO account_deletion_requests (user_id, origin, mode, grace_days, requested_at,"
                + " due_at, status, notice_state) VALUES (?, 'USER', 'GRACE', 30, ?, ?, 'SCHEDULED',"
                + " 'NOT_APPLICABLE') RETURNING id",
            Long.class,
            id,
            Timestamp.from(requestedAt),
            Timestamp.from(dueAt));
    jdbc.update(
        "UPDATE users SET deletion_requested_at = ?, deletion_due_at = ?, deletion_origin = 'USER',"
            + " deletion_request_id = ? WHERE id = ?",
        Timestamp.from(requestedAt),
        Timestamp.from(dueAt),
        requestId,
        id);
  }

  /**
   * Agenda a exclusão pedida por um administrador (7 dias de carência, primeiro motivo semeado),
   * com o livro-razão e as quatro colunas coerentes. O usuário não a desfaz.
   */
  public void scheduleAdminDeletion(long id, long adminId, Instant requestedAt) {
    Instant dueAt = requestedAt.plus(Duration.ofDays(7));
    Reason reason = DELETION_REASONS.get(0);
    Long requestId =
        jdbc.queryForObject(
            "INSERT INTO account_deletion_requests (user_id, origin, mode, grace_days, requested_at,"
                + " due_at, requested_by, reason_id, reason_name, reason_message, status, notice_state)"
                + " VALUES (?, 'ADMIN', 'GRACE', 7, ?, ?, ?, 1, ?, ?, 'SCHEDULED', 'NOT_APPLICABLE')"
                + " RETURNING id",
            Long.class,
            id,
            Timestamp.from(requestedAt),
            Timestamp.from(dueAt),
            adminId,
            reason.name(),
            reason.message());
    jdbc.update(
        "UPDATE users SET deletion_requested_at = ?, deletion_due_at = ?, deletion_origin = 'ADMIN',"
            + " deletion_request_id = ? WHERE id = ?",
        Timestamp.from(requestedAt),
        Timestamp.from(dueAt),
        requestId,
        id);
  }

  private void allowRootChange() {
    jdbc.execute("SET LOCAL gefinc.allow_root_change = 'on'");
  }

  private SeededUser insert(String email, String role) {
    Long id =
        jdbc.queryForObject(
            "INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, now())"
                + " RETURNING id",
            Long.class,
            email,
            encoder.encode(TestUsers.PASSWORD),
            role);
    return new SeededUser(id, email);
  }
}
