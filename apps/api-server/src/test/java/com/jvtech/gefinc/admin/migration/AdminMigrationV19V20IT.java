package com.jvtech.gefinc.admin.migration;

import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.support.MigrationTestBase;
import java.sql.Connection;
import java.sql.Statement;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Migrações V19 e V20: tabelas nascem vazias e o banco guarda as regras de cada estado. */
class AdminMigrationV19V20IT extends MigrationTestBase {

  private static final String CHECK = "23514";
  private static final String UNIQUE = "23505";
  private static final String FOREIGN_KEY = "23503";

  private static String delivery(String status, String reason, String kind) {
    return "insert into email_deliveries (kind, recipient_ref, status, failure_reason) values ('"
        + kind
        + "', 'ref', '"
        + status
        + "', "
        + (reason == null ? "null" : "'" + reason + "'")
        + ")";
  }

  private static String pending(String state, String retainedEmail, String retainedUntil) {
    return "insert into pending_communications (kind, deletion_request_id, user_id, target_ref,"
        + " state, retained_email, retained_until) values ('DELETION_NOTICE', 1, 7, 'ref', '"
        + state
        + "', "
        + (retainedEmail == null ? "null" : "'" + retainedEmail + "'")
        + ", "
        + (retainedUntil == null ? "null" : "'" + retainedUntil + "'")
        + ")";
  }

  private static String invitation(String email, String hash, String status) {
    return "insert into invitations (email, email_ref, token_hash, status, expires_at) values ("
        + (email == null ? "null" : "'" + email + "'")
        + ", 'ref', '"
        + hash
        + "', '"
        + status
        + "', now() + interval '7 days')";
  }

  private static String emailChange(
      long user, String status, String newEmail, String codeHash, int attempts) {
    return "insert into pending_email_changes (user_id, new_email, new_email_ref, code_hash,"
        + " attempts, status, expires_at) values ("
        + user
        + ", "
        + (newEmail == null ? "null" : "'" + newEmail + "'")
        + ", 'ref', "
        + (codeHash == null ? "null" : "'" + codeHash + "'")
        + ", "
        + attempts
        + ", '"
        + status
        + "', now() + interval '15 minutes')";
  }

  @Test
  void tabelasNascemVaziasEOsIndicesExistem() throws Exception {
    flyway("20").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      for (String table :
          List.of(
              "email_deliveries",
              "pending_communications",
              "invitations",
              "pending_email_changes")) {
        assertThat(scalar(s, "select count(*) from " + table)).as(table).isZero();
      }
      for (String index :
          List.of(
              "ix_ed_time",
              "ix_ed_status_kind",
              "ix_ed_user",
              "ix_pc_pending",
              "ux_inv_pending_email",
              "ix_inv_status",
              "ux_pec_user_pending")) {
        assertThat(indexExists(s, index)).as(index).isTrue();
      }
    }
  }

  @Test
  void historicoDeEnviosSoTemMotivoQuandoFalhou() throws Exception {
    flyway("20").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      s.execute(delivery("SENT", null, "PASSWORD_RESET"));
      s.execute(delivery("FAILED", "AUTHENTICATION", "INVITATION"));
      s.execute(delivery("FAILED", "TRANSIENT_EXHAUSTED", "DELETION_NOTICE"));
      assertRejected(c, delivery("SENT", "OTHER", "PASSWORD_RESET"), CHECK);
      assertRejected(c, delivery("FAILED", null, "PASSWORD_RESET"), CHECK);
      assertRejected(c, delivery("FAILED", "EXPLODIU", "PASSWORD_RESET"), CHECK);
      assertRejected(c, delivery("TALVEZ", null, "PASSWORD_RESET"), CHECK);
      assertRejected(c, delivery("SENT", null, "SPAM"), CHECK);
      assertThat(scalar(s, "select count(*) from email_deliveries where attempts = 1"))
          .isEqualTo(3);
    }
  }

  @Test
  void historicoDeEnviosNaoTemColunasDeConteudo() throws Exception {
    flyway("20").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(
              scalar(
                  s,
                  "select count(*) from information_schema.columns where table_name ="
                      + " 'email_deliveries' and column_name ~"
                      + " '(body|subject|link|token|code|message|error)'"))
          .isZero();
    }
  }

  @Test
  void comunicacaoPendenteSoRetemEnderecoEnquantoPendenteEComPrazo() throws Exception {
    flyway("20").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      s.execute(
          "insert into account_deletion_requests (user_id, origin, mode, grace_days, requested_at,"
              + " due_at, status, notice_state) values (7, 'USER', 'GRACE', 30, now(), now(),"
              + " 'EXECUTED', 'NOT_APPLICABLE')");
      s.execute(pending("PENDING", "ana@x.com", "2026-12-10T00:00:00Z"));
      s.execute(pending("DELIVERED", null, null));
      s.execute(pending("PENDING", null, null));
      assertRejected(c, pending("PENDING", "ana@x.com", null), CHECK);
      assertRejected(c, pending("DELIVERED", "ana@x.com", "2026-12-10T00:00:00Z"), CHECK);
      assertRejected(c, pending("DISCARDED", "ana@x.com", "2026-12-10T00:00:00Z"), CHECK);
      assertRejected(c, pending("EXPIRED", "ana@x.com", "2026-12-10T00:00:00Z"), CHECK);
      assertRejected(c, pending("TALVEZ", null, null), CHECK);
      assertRejected(
          c,
          pending("PENDING", null, null)
              .replace("values ('DELETION_NOTICE', 1,", "values ('DELETION_NOTICE', 999,"),
          FOREIGN_KEY);
    }
  }

  @Test
  void conviteGuardaEmailSoQuandoPendenteEUmPendentePorEmail() throws Exception {
    flyway("20").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      s.execute(invitation("ana@x.com", "h1", "PENDING"));
      s.execute(invitation(null, "h2", "ACCEPTED"));
      s.execute(invitation(null, "h3", "CANCELED"));
      assertRejected(c, invitation("ana@x.com", "h4", "ACCEPTED"), CHECK);
      assertRejected(c, invitation(null, "h5", "PENDING"), CHECK);
      assertRejected(c, invitation("x@x.com", "h6", "TALVEZ"), CHECK);
      // um pendente por e-mail, sem diferenciar caixa; o hash do token é único
      assertRejected(c, invitation("ANA@x.com", "h7", "PENDING"), UNIQUE);
      assertRejected(c, invitation("outra@x.com", "h1", "PENDING"), UNIQUE);
      // depois de resolvido, o e-mail pode ser convidado de novo
      s.execute("update invitations set status = 'CANCELED', email = null where token_hash = 'h1'");
      s.execute(invitation("ana@x.com", "h8", "PENDING"));
    }
  }

  @Test
  void conviteGuardaQuemConvidouEViraNuloQuandoOAdministradorEhExcluido() throws Exception {
    flyway("20").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      long admin =
          scalar(
              s, "insert into users (email, password_hash) values ('adm@x.com', 'x') returning id");
      s.execute(invitation("ana@x.com", "h1", "PENDING"));
      s.execute("update invitations set invited_by = " + admin);

      s.execute("delete from users where id = " + admin);

      assertThat(scalar(s, "select count(*) from invitations where invited_by is null"))
          .isEqualTo(1);
    }
  }

  @Test
  void trocaDeEmailExigeCodigoEmailEUmaPendentePorUsuarioComNoMaximoCincoErros() throws Exception {
    flyway("20").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      long user =
          scalar(
              s, "insert into users (email, password_hash) values ('a@x.com', 'x') returning id");
      s.execute(emailChange(user, "PENDING", "novo@x.com", "hash", 0));
      assertRejected(c, emailChange(user, "PENDING", "outro@x.com", "hash", 0), UNIQUE);
      assertRejected(c, emailChange(user + 1, "PENDING", "x@x.com", "hash", 0), FOREIGN_KEY);
      assertRejected(c, emailChange(user, "CANCELED", null, null, 6), CHECK);
      assertRejected(c, emailChange(user, "CANCELED", null, null, -1), CHECK);
      assertRejected(
          c,
          emailChange(user, "CANCELED", "n@x.com", "h", 5).replace("'CANCELED'", "'TALVEZ'"),
          CHECK);
      // fora de PENDING o e-mail novo e o hash são zerados e várias linhas convivem
      s.execute(emailChange(user, "CANCELED", null, null, 2));
      s.execute(emailChange(user, "INVALIDATED", null, null, 5));
      assertRejected(
          c, "update pending_email_changes set code_hash = null where status = 'PENDING'", CHECK);
      assertRejected(
          c, "update pending_email_changes set new_email = null where status = 'PENDING'", CHECK);

      s.execute("delete from users where id = " + user);

      assertThat(scalar(s, "select count(*) from pending_email_changes")).isZero();
    }
  }
}
