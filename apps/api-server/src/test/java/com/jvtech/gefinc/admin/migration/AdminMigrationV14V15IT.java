package com.jvtech.gefinc.admin.migration;

import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.support.AdminSeed;
import com.jvtech.gefinc.support.MigrationTestBase;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Migrações V14 e V15 do painel administrativo: sementes (iguais às de {@link AdminSeed}), e regras
 * que o banco precisa garantir sozinho (Princípio V).
 */
class AdminMigrationV14V15IT extends MigrationTestBase {

  private static final String CHECK = "23514";
  private static final String UNIQUE = "23505";
  private static final String FOREIGN_KEY = "23503";

  private static String ledger(String columns, String values) {
    return "insert into account_deletion_requests (" + columns + ") values (" + values + ")";
  }

  private static final String BASE_COLUMNS =
      "user_id, origin, mode, grace_days, requested_at, due_at, status, notice_state";

  private static String userRow(long user, String status) {
    return ledger(
        BASE_COLUMNS,
        user
            + ", 'USER', 'GRACE', 30, now(), now() + interval '720 hours', '"
            + status
            + "', 'NOT_APPLICABLE'");
  }

  private static String adminRow(String extraColumns, String extraValues, String overrides) {
    String mode = overrides.isEmpty() ? "'GRACE', 7" : overrides;
    return ledger(
        "user_id, origin, mode, grace_days, requested_at, due_at, status, notice_state"
            + extraColumns,
        "1, 'ADMIN', "
            + mode
            + ", now(), now() + interval '168 hours', 'SCHEDULED', 'QUEUED'"
            + extraValues);
  }

  private static final String ADMIN_FIELDS =
      ", requested_by, reason_id, reason_name, reason_message";
  private static final String ADMIN_VALUES = ", 9, 1, 'Motivo', 'Mensagem'";

  @Test
  void sementesIguaisAsConstantesDeAdminSeed() throws Exception {
    flyway("15").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      Map<String, String> parameters = new LinkedHashMap<>();
      try (ResultSet rs = s.executeQuery("select key, value from system_parameters")) {
        while (rs.next()) {
          parameters.put(rs.getString(1), rs.getString(2));
        }
      }
      assertThat(parameters).containsExactlyInAnyOrderEntriesOf(AdminSeed.PARAMETERS);

      List<AdminSeed.Reason> reasons = new ArrayList<>();
      try (ResultSet rs =
          s.executeQuery(
              "select name, message from deletion_reasons where initial and active order by id")) {
        while (rs.next()) {
          reasons.add(new AdminSeed.Reason(rs.getString(1), rs.getString(2)));
        }
      }
      assertThat(reasons).containsExactlyElementsOf(AdminSeed.DELETION_REASONS);
      assertThat(scalar(s, "select count(*) from deletion_reasons")).isEqualTo(4);
    }
  }

  @Test
  void mensagensSemeadasSaoGenericas() throws Exception {
    flyway("15").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement();
        ResultSet rs = s.executeQuery("select message from deletion_reasons")) {
      while (rs.next()) {
        assertThat(rs.getString(1))
            .doesNotContain("@")
            .doesNotContain("http")
            .doesNotContain("{{")
            .doesNotContain("${")
            .doesNotContain("%s")
            .doesNotContainPattern("\\d{8}");
      }
    }
  }

  @Test
  void parametrosSoAceitamAsChavesConhecidasEBooleanosValidos() throws Exception {
    flyway("15").migrate();
    try (Connection c = connection()) {
      assertRejected(c, "insert into system_parameters (key, value) values ('OUTRA', 'x')", CHECK);
      assertRejected(
          c, "update system_parameters set value = 'talvez' where key = 'SIGNUPS_OPEN'", CHECK);
      assertRejected(
          c, "update system_parameters set value = 'sim' where key = 'MAINTENANCE_ENABLED'", CHECK);
      assertRejected(
          c, "insert into system_parameters (key, value) values ('SIGNUPS_OPEN', 'true')", UNIQUE);
      try (Statement s = c.createStatement()) {
        s.execute(
            "update system_parameters set value = 'texto livre' where key = 'MAINTENANCE_MESSAGE'");
        s.execute("update system_parameters set value = 'false' where key = 'SIGNUPS_OPEN'");
      }
    }
  }

  @Test
  void parametroGuardaQuemAlterouEViraNuloQuandoOUsuarioEhExcluido() throws Exception {
    flyway("15").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      long admin =
          scalar(
              s, "insert into users (email, password_hash) values ('adm@x.com', 'x') returning id");
      s.execute(
          "update system_parameters set updated_by = " + admin + " where key = 'SIGNUPS_OPEN'");
      s.execute("delete from users where id = " + admin);

      assertThat(scalar(s, "select count(*) from system_parameters where updated_by is null"))
          .isEqualTo(3);
    }
  }

  @Test
  void nomeDeMotivoEUnicoSemDiferenciarCaixaEFkImpedeApagarMotivoUsado() throws Exception {
    flyway("15").migrate();
    try (Connection c = connection()) {
      assertRejected(
          c,
          "insert into deletion_reasons (name, message) values ('VIOLAÇÃO DOS TERMOS DE USO', 'm')",
          UNIQUE);
      try (Statement s = c.createStatement()) {
        s.execute(adminRow(ADMIN_FIELDS, ADMIN_VALUES, ""));
      }
      assertRejected(c, "delete from deletion_reasons where id = 1", FOREIGN_KEY);
    }
  }

  @Test
  void livroRazaoRecusaCombinacoesInvalidas() throws Exception {
    flyway("15").migrate();
    try (Connection c = connection()) {
      // carência fora de 1..30 e modo/dias incoerentes
      assertRejected(c, adminRow(ADMIN_FIELDS, ADMIN_VALUES, "'GRACE', 0"), CHECK);
      assertRejected(c, adminRow(ADMIN_FIELDS, ADMIN_VALUES, "'GRACE', 31"), CHECK);
      assertRejected(c, adminRow(ADMIN_FIELDS, ADMIN_VALUES, "'GRACE', null"), CHECK);
      assertRejected(c, adminRow(ADMIN_FIELDS, ADMIN_VALUES, "'IMMEDIATE', 5"), CHECK);
      // administrador sem motivo, sem mensagem fixada ou sem quem pediu
      assertRejected(c, adminRow("", "", ""), CHECK);
      assertRejected(
          c, adminRow(", requested_by, reason_id, reason_name", ", 9, 1, 'M'", ""), CHECK);
      assertRejected(
          c,
          adminRow(", reason_id, reason_name, reason_message", ", 1, 'Motivo', 'Mensagem'", ""),
          CHECK);
      // usuário só com carência de 30 dias e sem aviso
      assertRejected(
          c,
          ledger(
              BASE_COLUMNS,
              "1, 'USER', 'IMMEDIATE', null, now(), now(), 'SCHEDULED', 'NOT_APPLICABLE'"),
          CHECK);
      assertRejected(
          c,
          ledger(
              BASE_COLUMNS,
              "1, 'USER', 'GRACE', 7, now(), now() + interval '7 days', 'SCHEDULED',"
                  + " 'NOT_APPLICABLE'"),
          CHECK);
      assertRejected(
          c,
          ledger(
              BASE_COLUMNS,
              "1, 'USER', 'GRACE', 30, now(), now() + interval '30 days', 'SCHEDULED', 'QUEUED'"),
          CHECK);
      // enumerações fechadas
      assertRejected(c, userRow(1, "OUTRO"), CHECK);
      assertRejected(
          c,
          ledger(
              BASE_COLUMNS, "1, 'ROOT', 'GRACE', 30, now(), now(), 'SCHEDULED', 'NOT_APPLICABLE'"),
          CHECK);
      // motivo inexistente
      assertRejected(
          c,
          adminRow(
              ", requested_by, reason_id, reason_name, reason_message",
              ", 9, 999, 'Motivo', 'Mensagem'",
              ""),
          FOREIGN_KEY);
    }
  }

  @Test
  void livroRazaoAceitaSolicitacaoValidaEUmaSoAtivaPorUsuario() throws Exception {
    flyway("15").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      s.execute(userRow(1, "SCHEDULED"));
      assertRejected(c, userRow(1, "SCHEDULED"), UNIQUE);
      // outro usuário, ou o mesmo já cancelado/executado, não conflita
      s.execute(userRow(2, "SCHEDULED"));
      s.execute(userRow(1, "CANCELED"));
      s.execute(userRow(1, "EXECUTED"));
      s.execute(adminRow(ADMIN_FIELDS, ADMIN_VALUES, "").replace("values (1,", "values (3,"));
      s.execute(
          adminRow(ADMIN_FIELDS, ADMIN_VALUES, "'IMMEDIATE', null")
              .replace("values (1,", "values (4,"));
      assertThat(scalar(s, "select count(*) from account_deletion_requests")).isEqualTo(6);
      // target_ref é anulável (desvio registrado: o HMAC não existe no banco)
      assertThat(
              scalar(s, "select count(*) from account_deletion_requests where target_ref is null"))
          .isEqualTo(6);
    }
  }

  @Test
  void avisosSaoApagadosComOUsuarioEAceitamSoOTipoConhecido() throws Exception {
    flyway("15").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      long user =
          scalar(
              s, "insert into users (email, password_hash) values ('u@x.com', 'x') returning id");
      s.execute(userRow(user, "CANCELED"));
      assertRejected(
          c,
          "insert into user_notices (user_id, kind, deletion_request_id) values ("
              + user
              + ", 'OUTRO', 1)",
          CHECK);
      assertRejected(
          c,
          "insert into user_notices (user_id, kind, deletion_request_id) values ("
              + user
              + ", 'DELETION_CANCELED', 999)",
          FOREIGN_KEY);
      s.execute(
          "insert into user_notices (user_id, kind, deletion_request_id) values ("
              + user
              + ", 'DELETION_CANCELED', 1)");

      s.execute("delete from users where id = " + user);

      assertThat(scalar(s, "select count(*) from user_notices")).isZero();
      // o livro-razão sobrevive à exclusão do usuário (sem chave estrangeira)
      assertThat(scalar(s, "select count(*) from account_deletion_requests")).isEqualTo(1);
    }
  }

  @Test
  void indicesExistem() throws Exception {
    flyway("15").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      for (String index :
          List.of("ux_dr_name", "ux_adr_active", "ix_adr_user", "ix_un_user_open")) {
        assertThat(indexExists(s, index)).as(index).isTrue();
      }
    }
  }
}
