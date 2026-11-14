package com.jvtech.gefinc.admin.migration;

import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.support.MigrationTestBase;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Migração V16 sobre usuários anteriores: papel padrão, preenchimento da exclusão por
 * autoatendimento já pendente no livro-razão, restrições de coerência e o gatilho que protege o
 * administrador raiz.
 */
class AdminMigrationV16IT extends MigrationTestBase {

  private static final String CHECK = "23514";
  private static final String PRIVILEGE = "42501";

  private static long insertUser(Statement s, String email, String extraColumns, String extraValues)
      throws SQLException {
    return scalar(
        s,
        "insert into users (email, password_hash"
            + extraColumns
            + ") values ('"
            + email
            + "', 'x'"
            + extraValues
            + ") returning id");
  }

  @Test
  void usuariosAntigosViramUsuarioComumEExclusaoPendenteEntraNoLivroRazao() throws Exception {
    flyway("15").migrate();
    long pending;
    long other;
    long plain;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      plain = insertUser(s, "livre@x.com", "", "");
      pending =
          insertUser(s, "pendente@x.com", ", deletion_requested_at", ", '2026-11-01T10:00:00Z'");
      other =
          insertUser(
              s, "outra@x.com", ", deletion_requested_at", ", '2026-10-15T08:30:00.123456Z'");
    }

    flyway("16").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(scalar(s, "select count(*) from users where role = 'USER'")).isEqualTo(3);
      assertThat(
              scalar(
                  s,
                  "select count(*) from users where id = "
                      + plain
                      + " and suspended_at is null and last_access_at is null and deletion_due_at"
                      + " is null and deletion_origin is null and deletion_request_id is null"))
          .isEqualTo(1);

      for (long id : new long[] {pending, other}) {
        try (ResultSet rs =
            s.executeQuery(
                "select u.deletion_requested_at, u.deletion_due_at, u.deletion_origin,"
                    + " r.requested_at, r.due_at, r.user_id, r.target_ref, r.origin, r.mode,"
                    + " r.grace_days, r.status, r.notice_state, r.requested_by, r.reason_id"
                    + " from users u join account_deletion_requests r on r.id ="
                    + " u.deletion_request_id where u.id = "
                    + id)) {
          assertThat(rs.next()).isTrue();
          // 720 horas = Duration.ofDays(30): idêntico ao cálculo feito em Java
          assertThat(rs.getTimestamp(2).toInstant())
              .isEqualTo(rs.getTimestamp(1).toInstant().plus(java.time.Duration.ofDays(30)));
          assertThat(rs.getString(3)).isEqualTo("USER");
          assertThat(rs.getTimestamp(4)).isEqualTo(rs.getTimestamp(1));
          assertThat(rs.getTimestamp(5)).isEqualTo(rs.getTimestamp(2));
          assertThat(rs.getLong(6)).isEqualTo(id);
          assertThat(rs.getString(7)).isNull();
          assertThat(rs.getString(8)).isEqualTo("USER");
          assertThat(rs.getString(9)).isEqualTo("GRACE");
          assertThat(rs.getInt(10)).isEqualTo(30);
          assertThat(rs.getString(11)).isEqualTo("SCHEDULED");
          assertThat(rs.getString(12)).isEqualTo("NOT_APPLICABLE");
          assertThat(rs.getObject(13)).isNull();
          assertThat(rs.getObject(14)).isNull();
        }
      }
      // quem não tinha exclusão pendente não ganha linha no livro-razão
      assertThat(scalar(s, "select count(*) from account_deletion_requests")).isEqualTo(2);
    }
  }

  @Test
  void migracaoSemUsuariosPendentesNaoCriaLinhasNoLivroRazao() throws Exception {
    flyway("15").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      insertUser(s, "a@x.com", "", "");
    }

    flyway("16").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(scalar(s, "select count(*) from account_deletion_requests")).isZero();
    }
  }

  @Test
  void coerenciaDaExclusaoEDoRaizEhGarantidaPeloBanco() throws Exception {
    flyway("16").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      long user = insertUser(s, "u@x.com", "", "");
      s.execute(
          "insert into account_deletion_requests (user_id, origin, mode, grace_days, requested_at,"
              + " due_at, status, notice_state) values ("
              + user
              + ", 'USER', 'GRACE', 30, now(), now() + interval '720 hours', 'CANCELED',"
              + " 'NOT_APPLICABLE')");
      String set = "update users set ";
      String where = " where id = " + user;

      // de uma a três colunas de exclusão preenchidas: recusado
      assertRejected(c, set + "deletion_requested_at = now()" + where, CHECK);
      assertRejected(
          c, set + "deletion_requested_at = now(), deletion_due_at = now()" + where, CHECK);
      assertRejected(
          c,
          set
              + "deletion_requested_at = now(), deletion_due_at = now(), deletion_origin = 'USER'"
              + where,
          CHECK);
      assertRejected(c, set + "deletion_origin = 'USER'" + where, CHECK);
      assertRejected(c, set + "deletion_request_id = 1" + where, CHECK);
      // vencimento anterior ao pedido
      assertRejected(
          c,
          set
              + "deletion_requested_at = now(), deletion_due_at = now() - interval '1 day',"
              + " deletion_origin = 'USER', deletion_request_id = 1"
              + where,
          CHECK);
      // origem e papel fora do domínio
      assertRejected(
          c,
          set
              + "deletion_requested_at = now(), deletion_due_at = now(), deletion_origin ="
              + " 'OUTRO', deletion_request_id = 1"
              + where,
          CHECK);
      assertRejected(c, set + "role = 'SUPER'" + where, CHECK);
      // as quatro juntas e coerentes: aceito
      s.execute(
          set
              + "deletion_requested_at = now(), deletion_due_at = now() + interval '1 day',"
              + " deletion_origin = 'USER', deletion_request_id = 1"
              + where);
    }
  }

  @Test
  void raizNuncaFicaSuspensoNemEmExclusao() throws Exception {
    flyway("16").migrate();
    try (Connection c = connection()) {
      c.setAutoCommit(false);
      long root;
      try (Statement s = c.createStatement()) {
        s.execute("set local gefinc.allow_root_change = 'on'");
        root = insertUser(s, "raiz@x.com", ", role", ", 'ROOT'");
        c.commit();
      }
      assertRejected(c, "update users set suspended_at = now() where id = " + root, CHECK);
      assertRejected(
          c,
          "update users set deletion_requested_at = now(), deletion_due_at = now(),"
              + " deletion_origin = 'ADMIN', deletion_request_id = 1 where id = "
              + root,
          CHECK);
    }
  }

  @Test
  void unaccentEIndicesDisponiveis() throws Exception {
    flyway("16").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(text(s, "select unaccent('João')")).isEqualTo("Joao");
      for (String index :
          List.of(
              "ix_users_deletion_due",
              "ix_users_role",
              "ix_users_created",
              "ix_users_last_access")) {
        assertThat(indexExists(s, index)).as(index).isTrue();
      }
      // o índice atual permanece (migrações são imutáveis)
      assertThat(indexExists(s, "ix_users_deletion_requested_at")).isTrue();
    }
  }

  @Test
  void gatilhoDoRaizSoDisparaEmMudancaDePapel() throws Exception {
    flyway("16").migrate();
    try (Connection c = connection()) {
      long user;
      try (Statement s = c.createStatement()) {
        user = insertUser(s, "comum@x.com", "", "");
      }
      // criar raiz ou promover a raiz sem a variável de sessão: recusado
      assertRejected(
          c,
          "insert into users (email, password_hash, role) values ('r@x.com', 'x', 'ROOT')",
          PRIVILEGE);
      assertRejected(c, "update users set role = 'ROOT' where id = " + user, PRIVILEGE);

      // com a variável local na transação, a promoção passa
      c.setAutoCommit(false);
      try (Statement s = c.createStatement()) {
        s.execute("set local gefinc.allow_root_change = 'on'");
        s.execute("update users set role = 'ROOT' where id = " + user);
        c.commit();
      }
      c.setAutoCommit(true);

      // a variável não vaza para fora da transação
      try (Statement s = c.createStatement()) {
        assertThat(
                text(s, "select coalesce(current_setting('gefinc.allow_root_change', true), '')"))
            .isNotEqualTo("on");
        // A7: alterar nome/senha/versão do raiz sem a variável passa (o Hibernate grava todas as
        // colunas)
        s.execute(
            "update users set password_hash = 'y', token_version = token_version + 1 where id = "
                + user);
        s.execute("update users set role = 'ROOT' where id = " + user);
        s.execute(
            "update users set last_access_at = now(), suspended_at = null where id = " + user);
      }
      // rebaixar o raiz, mudar para ADMIN ou apagá-lo sem a variável: recusado
      assertRejected(c, "update users set role = 'ADMIN' where id = " + user, PRIVILEGE);
      assertRejected(c, "update users set role = 'USER' where id = " + user, PRIVILEGE);
      assertRejected(c, "delete from users where id = " + user, PRIVILEGE);

      // administrador comum pode ser promovido e rebaixado sem a variável
      long admin;
      try (Statement s = c.createStatement()) {
        admin = insertUser(s, "adm@x.com", ", role", ", 'ADMIN'");
        s.execute("update users set role = 'USER' where id = " + admin);
        s.execute("update users set role = 'ADMIN' where id = " + admin);
        s.execute("delete from users where id = " + admin);
      }

      // com a variável, o raiz pode ser apagado
      c.setAutoCommit(false);
      try (Statement s = c.createStatement()) {
        s.execute("set local gefinc.allow_root_change = 'on'");
        s.execute("delete from users where id = " + user);
        c.commit();
        assertThat(scalar(s, "select count(*) from users")).isZero();
      }
    }
  }
}
