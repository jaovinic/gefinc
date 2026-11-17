package com.jvtech.gefinc.admin.email;

import com.jvtech.gefinc.admin.audit.PartyView;
import com.jvtech.gefinc.admin.common.KeysetCursor;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.mail.MailKind;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Histórico de envios dos últimos 90 dias ({@code GET /admin/email/deliveries}), mais recente
 * primeiro, com cursor opaco {@code (created_at, id)}. O destinatário aparece em claro enquanto a
 * conta existir; sem e-mail gravado ou com a conta removida, vira {@code anônimo-…}. Nunca expõe
 * {@code recipient_ref}, corpo, assunto, link, token nem código. Somente leitura.
 */
@Service
public class EmailDeliveryQueryService {

  static final int DEFAULT_LIMIT = 50;
  static final int MAX_LIMIT = 100;

  private static final int REF_HEX = 8;

  private final UserRepository users;
  private final Pseudonymizer pseudonymizer;
  private final EntityManager entityManager;
  private final Clock clock;

  public EmailDeliveryQueryService(
      UserRepository users, Pseudonymizer pseudonymizer, EntityManager entityManager, Clock clock) {
    this.users = users;
    this.pseudonymizer = pseudonymizer;
    this.entityManager = entityManager;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public EmailDeliveryPageView list(String status, String kind, String cursor, Integer limit) {
    ApiException invalid = ApiException.validation("Há campos inválidos.");
    boolean hasErrors = false;

    String statusValue = null;
    if (status != null && !status.isBlank()) {
      if (EmailDelivery.SENT.equals(status) || EmailDelivery.FAILED.equals(status)) {
        statusValue = status;
      } else {
        invalid.withFieldError("status", "Situação inválida.");
        hasErrors = true;
      }
    }

    MailKind kindValue = null;
    if (kind != null && !kind.isBlank()) {
      kindValue = parseKind(kind);
      if (kindValue == null) {
        invalid.withFieldError("kind", "Tipo inválido.");
        hasErrors = true;
      }
    }

    KeysetCursor decoded = null;
    if (cursor != null && !cursor.isBlank()) {
      try {
        decoded = KeysetCursor.decode(cursor);
      } catch (ApiException e) {
        invalid.withFieldError("cursor", "Cursor inválido.");
        hasErrors = true;
      }
    }

    int pageLimit = limit == null ? DEFAULT_LIMIT : limit;
    if (pageLimit < 1 || pageLimit > MAX_LIMIT) {
      invalid.withFieldError("limit", "O limite vai de 1 a " + MAX_LIMIT + ".");
      hasErrors = true;
    }
    if (hasErrors) {
      throw invalid;
    }

    List<EmailDelivery> rows = query(statusValue, kindValue, decoded, pageLimit + 1);
    boolean hasMore = rows.size() > pageLimit;
    List<EmailDelivery> pageRows = hasMore ? rows.subList(0, pageLimit) : rows;
    Map<Long, User> accounts = resolveAccounts(pageRows);
    List<EmailDeliveryView> content = pageRows.stream().map(row -> view(row, accounts)).toList();
    String nextCursor = null;
    if (hasMore) {
      EmailDelivery last = pageRows.get(pageRows.size() - 1);
      nextCursor = new KeysetCursor(last.getCreatedAt(), last.getId()).encode();
    }
    return new EmailDeliveryPageView(content, nextCursor);
  }

  private List<EmailDelivery> query(
      String status, MailKind kind, KeysetCursor cursor, int maxResults) {
    StringBuilder jpql =
        new StringBuilder("SELECT d FROM EmailDelivery d WHERE d.createdAt >= :since");
    if (status != null) {
      jpql.append(" AND d.status = :status");
    }
    if (kind != null) {
      jpql.append(" AND d.kind = :kind");
    }
    if (cursor != null) {
      jpql.append(
          " AND (d.createdAt < :cursorAt OR (d.createdAt = :cursorAt AND d.id < :cursorId))");
    }
    jpql.append(" ORDER BY d.createdAt DESC, d.id DESC");
    TypedQuery<EmailDelivery> query =
        entityManager.createQuery(jpql.toString(), EmailDelivery.class);
    Instant since = clock.instant().minus(EmailDeliveryPurgeJob.RETENTION);
    query.setParameter("since", since);
    if (status != null) {
      query.setParameter("status", status);
    }
    if (kind != null) {
      query.setParameter("kind", kind);
    }
    if (cursor != null) {
      query.setParameter("cursorAt", cursor.occurredAt());
      query.setParameter("cursorId", cursor.id());
    }
    query.setMaxResults(maxResults);
    return query.getResultList();
  }

  private Map<Long, User> resolveAccounts(List<EmailDelivery> rows) {
    Set<Long> ids = new HashSet<>();
    for (EmailDelivery row : rows) {
      if (row.getUserId() != null) {
        ids.add(row.getUserId());
      }
    }
    if (ids.isEmpty()) {
      return Map.of();
    }
    return users.findAllById(ids).stream()
        .collect(Collectors.toMap(User::getId, user -> user, (a, b) -> a));
  }

  private EmailDeliveryView view(EmailDelivery row, Map<Long, User> accounts) {
    return new EmailDeliveryView(
        row.getId(),
        row.getCreatedAt(),
        row.getKind(),
        recipient(row, accounts),
        row.getStatus(),
        row.getFailureReason());
  }

  private PartyView recipient(EmailDelivery row, Map<Long, User> accounts) {
    Long userId = row.getUserId();
    String email = row.getRecipientEmail();
    if (userId != null) {
      User account = accounts.get(userId);
      if (account == null) {
        return new PartyView(userId, pseudonymizer.anonymousLabel(userId));
      }
      return new PartyView(userId, email != null && !email.isBlank() ? email : account.getEmail());
    }
    if (email != null && !email.isBlank()) {
      return new PartyView(null, email);
    }
    String ref = row.getRecipientRef();
    return new PartyView(
        null, "anônimo-" + (ref.length() >= REF_HEX ? ref.substring(0, REF_HEX) : ref));
  }

  private static MailKind parseKind(String value) {
    if (value.indexOf('\0') >= 0) {
      return null;
    }
    for (MailKind candidate : MailKind.values()) {
      if (candidate.name().equals(value)) {
        return candidate;
      }
    }
    return null;
  }
}
