package com.jvtech.gefinc.admin.migration;

import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.support.MigrationTestBase;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Migração V17: uma sessão por família de tokens de renovação já existente. */
class AdminMigrationV17IT extends MigrationTestBase {

  private static void token(
      Statement s,
      long user,
      UUID family,
      String hash,
      String createdAt,
      String expiresAt,
      String revokedAt)
      throws SQLException {
    s.execute(
        "insert into refresh_tokens (user_id, family_id, token_hash, expires_at, revoked_at,"
            + " created_at) values ("
            + user
            + ", '"
            + family
            + "', '"
            + hash
            + "', '"
            + expiresAt
            + "', "
            + (revokedAt == null ? "null" : "'" + revokedAt + "'")
            + ", '"
            + createdAt
            + "')");
  }

  @Test
  void preencheUmaSessaoPorFamiliaComRevogacaoSoQuandoTodosOsTokensForamRevogados()
      throws Exception {
    flyway("16").migrate();
    UUID partial = UUID.randomUUID();
    UUID revoked = UUID.randomUUID();
    UUID active = UUID.randomUUID();
    long ana;
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      ana =
          scalar(
              s, "insert into users (email, password_hash) values ('a@x.com', 'x') returning id");
      // parcialmente revogada: o último token (ativo) mantém a sessão aberta
      token(
          s,
          ana,
          partial,
          "p1",
          "2026-11-01T10:00:00Z",
          "2026-12-01T10:00:00Z",
          "2026-11-02T10:00:00Z");
      token(s, ana, partial, "p2", "2026-11-02T10:00:00Z", "2026-12-02T10:00:00Z", null);
      // totalmente revogada
      token(
          s,
          ana,
          revoked,
          "r1",
          "2026-10-01T10:00:00Z",
          "2026-10-31T10:00:00Z",
          "2026-10-05T10:00:00Z");
      token(
          s,
          ana,
          revoked,
          "r2",
          "2026-10-05T10:00:00Z",
          "2026-11-04T10:00:00Z",
          "2026-10-09T10:00:00Z");
      // ativa, um só token
      token(s, ana, active, "a1", "2026-11-09T10:00:00Z", "2026-12-09T10:00:00Z", null);
    }

    flyway("17").migrate();

    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(scalar(s, "select count(*) from auth_sessions")).isEqualTo(3);
      assertThat(
              scalar(
                  s,
                  "select count(*) from auth_sessions where client_ip is null"
                      + " and device_label is null and client_kind = 'OTHER' and user_id = "
                      + ana))
          .isEqualTo(3);
      try (ResultSet rs =
          s.executeQuery(
              "select created_at, last_used_at, expires_at, revoked_at, revoked_by from auth_sessions"
                  + " where id = '"
                  + partial
                  + "'")) {
        assertThat(rs.next()).isTrue();
        assertThat(rs.getTimestamp(1).toInstant())
            .isEqualTo(java.time.Instant.parse("2026-11-01T10:00:00Z"));
        assertThat(rs.getTimestamp(2).toInstant())
            .isEqualTo(java.time.Instant.parse("2026-11-02T10:00:00Z"));
        assertThat(rs.getTimestamp(3).toInstant())
            .isEqualTo(java.time.Instant.parse("2026-12-02T10:00:00Z"));
        assertThat(rs.getTimestamp(4)).isNull();
        assertThat(rs.getString(5)).isNull();
      }
      try (ResultSet rs =
          s.executeQuery(
              "select revoked_at, revoked_by, expires_at from auth_sessions where id = '"
                  + revoked
                  + "'")) {
        assertThat(rs.next()).isTrue();
        assertThat(rs.getTimestamp(1).toInstant())
            .isEqualTo(java.time.Instant.parse("2026-10-09T10:00:00Z"));
        assertThat(rs.getString(2)).isEqualTo("SYSTEM");
        assertThat(rs.getTimestamp(3).toInstant())
            .isEqualTo(java.time.Instant.parse("2026-11-04T10:00:00Z"));
      }
      assertThat(scalar(s, "select count(*) from auth_sessions where revoked_at is null"))
          .isEqualTo(2);
    }
  }

  @Test
  void bancoSemTokensGeraTabelaVazia() throws Exception {
    flyway("17").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      assertThat(scalar(s, "select count(*) from auth_sessions")).isZero();
      assertThat(indexExists(s, "ix_as_user_open")).isTrue();
    }
  }

  @Test
  void restricoesDeDominioECascataAoExcluirOUsuario() throws Exception {
    flyway("17").migrate();
    try (Connection c = connection();
        Statement s = c.createStatement()) {
      long user =
          scalar(
              s, "insert into users (email, password_hash) values ('b@x.com', 'x') returning id");
      String insert =
          "insert into auth_sessions (id, user_id, created_at, last_used_at, expires_at, client_kind,"
              + " revoked_by) values (gen_random_uuid(), "
              + user
              + ", now(), now(), now() + interval '1 day', ";
      assertRejected(c, insert + "'TABLET', null)", "23514");
      assertRejected(c, insert + "'WEB', 'OUTRO')", "23514");
      s.execute(insert + "'MOBILE', 'ADMIN')");
      s.execute(insert + "'WEB', null)");
      assertThat(scalar(s, "select count(*) from auth_sessions")).isEqualTo(2);

      s.execute("delete from users where id = " + user);

      assertThat(scalar(s, "select count(*) from auth_sessions")).isZero();
    }
  }
}
