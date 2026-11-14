package com.jvtech.gefinc.admin.user;

import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminUserCounts;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminUserRow;
import com.jvtech.gefinc.user.UserRole;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Consultas de leitura do painel sobre {@code users} e {@code auth_sessions} (nenhuma tabela
 * financeira). A busca é nativa: {@code unaccent} (extensão da V16) e {@code lower} dos dois lados,
 * e {@code LIKE ... ESCAPE '\'} com o texto digitado escapado no próprio SQL, de modo que {@code
 * %}, {@code _} e {@code \} valem como texto. Todo o texto do SQL é fixo; o que o usuário digita só
 * entra como parâmetro. A ordenação é por {@code (campo, id)}, com o id desempatando na mesma
 * direção, o que mantém a paginação estável.
 */
@Repository
public class AdminUserRepository {

  /** Situação filtrável da lista. */
  public enum StatusFilter {
    ACTIVE("u.suspended_at IS NULL AND u.deletion_requested_at IS NULL"),
    SUSPENDED("u.suspended_at IS NOT NULL"),
    DELETION_PENDING("u.deletion_requested_at IS NOT NULL"),
    ADMIN("u.role <> 'USER'");

    private final String predicate;

    StatusFilter(String predicate) {
      this.predicate = predicate;
    }
  }

  /** Campo de ordenação. */
  public enum SortField {
    CREATED_AT("u.created_at"),
    LAST_ACCESS_AT("u.last_access_at");

    private final String column;

    SortField(String column) {
      this.column = column;
    }
  }

  /** Pedido de página; {@code q} nulo não filtra por texto. */
  public record Query(
      String q, StatusFilter status, SortField sort, boolean ascending, int page, int size) {}

  /** Contagens da busca ({@code total} é o número de linhas dela, sem o filtro de situação). */
  public record Counts(long total, AdminUserCounts byStatus) {}

  private static final String MATCH =
      "(lower(unaccent(u.email)) LIKE '%' || replace(replace(replace(lower(unaccent(?::text)),"
          + " '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'"
          + " OR lower(unaccent(coalesce(u.name, ''))) LIKE '%' ||"
          + " replace(replace(replace(lower(unaccent(?::text)), '\\', '\\\\'), '%', '\\%'), '_',"
          + " '\\_') || '%' ESCAPE '\\')";

  private static final String COLUMNS =
      "u.id, u.email, u.name, u.created_at, u.last_access_at, u.role,"
          + " (u.suspended_at IS NOT NULL) AS suspended,"
          + " (u.deletion_requested_at IS NOT NULL) AS deletion_pending";

  private final JdbcTemplate jdbc;

  public AdminUserRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public List<AdminUserRow> page(Query query) {
    StringBuilder sql =
        new StringBuilder("SELECT ").append(COLUMNS).append(" FROM users u WHERE TRUE");
    List<Object> args = new ArrayList<>();
    if (query.q() != null) {
      sql.append(" AND ").append(MATCH);
      args.add(query.q());
      args.add(query.q());
    }
    if (query.status() != null) {
      sql.append(" AND ").append(query.status().predicate);
    }
    String direction = query.ascending() ? "ASC" : "DESC";
    sql.append(" ORDER BY ")
        .append(query.sort().column)
        .append(' ')
        .append(direction)
        .append(" NULLS LAST, u.id ")
        .append(direction)
        .append(" LIMIT ? OFFSET ?");
    args.add(query.size());
    args.add((long) query.page() * query.size());
    return jdbc.query(sql.toString(), (rs, i) -> row(rs), args.toArray());
  }

  /** Contagens por situação da busca, em uma só leitura da tabela. */
  public Counts counts(String q) {
    StringBuilder sql =
        new StringBuilder(
            "SELECT count(*) AS total,"
                + " count(*) FILTER (WHERE u.suspended_at IS NULL AND u.deletion_requested_at IS NULL)"
                + " AS active,"
                + " count(*) FILTER (WHERE u.suspended_at IS NOT NULL) AS suspended,"
                + " count(*) FILTER (WHERE u.deletion_requested_at IS NOT NULL) AS deletion_pending,"
                + " count(*) FILTER (WHERE u.role <> 'USER') AS admin FROM users u WHERE TRUE");
    List<Object> args = new ArrayList<>();
    if (q != null) {
      sql.append(" AND ").append(MATCH);
      args.add(q);
      args.add(q);
    }
    return jdbc.queryForObject(
        sql.toString(),
        (rs, i) ->
            new Counts(
                rs.getLong("total"),
                new AdminUserCounts(
                    rs.getLong("active"),
                    rs.getLong("suspended"),
                    rs.getLong("deletion_pending"),
                    rs.getLong("admin"))),
        args.toArray());
  }

  /** Sessões abertas: não revogadas e ainda não expiradas no instante informado. */
  public int countOpenSessions(long userId, Instant now) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL"
                + " AND expires_at > ?",
            Integer.class,
            userId,
            Timestamp.from(now));
    return count == null ? 0 : count;
  }

  private static AdminUserRow row(java.sql.ResultSet rs) throws java.sql.SQLException {
    Timestamp lastAccess = rs.getTimestamp("last_access_at");
    return new AdminUserRow(
        rs.getLong("id"),
        rs.getString("email"),
        rs.getString("name"),
        rs.getTimestamp("created_at").toInstant(),
        lastAccess == null ? null : lastAccess.toInstant(),
        UserRole.valueOf(rs.getString("role")),
        rs.getBoolean("suspended"),
        rs.getBoolean("deletion_pending"));
  }
}
