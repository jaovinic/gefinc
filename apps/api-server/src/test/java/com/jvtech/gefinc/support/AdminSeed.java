package com.jvtech.gefinc.support;

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
