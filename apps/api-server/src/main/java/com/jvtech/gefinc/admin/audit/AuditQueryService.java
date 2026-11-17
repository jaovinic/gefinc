package com.jvtech.gefinc.admin.audit;

import com.jvtech.gefinc.admin.common.KeysetCursor;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consulta somente leitura da trilha de auditoria ({@code GET /admin/audit}, {@code GET
 * /admin/audit/{id}} e o histórico do detalhe de um usuário). Resolve quem agiu e quem sofreu a
 * ação em lote a partir de {@code users} (nome ou e-mail), com o rótulo anônimo derivado do id
 * quando a conta já não existe. A lista e o histórico nunca devolvem IP nem {@code client}; o
 * detalhe traz {@code client} (referência anônima estável e, enquanto existir em {@code
 * audit_log_client}, o IP e o dispositivo).
 */
@Service
public class AuditQueryService {

  static final int DEFAULT_LIMIT = 50;
  static final int MAX_LIMIT = 100;

  private static final String VISITOR_LABEL = "visitante";
  private static final String SYSTEM_LABEL = "sistema";
  private static final String UNKNOWN_LABEL = "desconhecido";
  private static final int CLIENT_REF_HEX = 8;

  private static final Set<String> KNOWN_DETAIL_KEYS =
      Arrays.stream(AuditKey.values()).map(AuditKey::json).collect(Collectors.toUnmodifiableSet());

  private final AuditLogRepository audit;
  private final AuditLogClientRepository clients;
  private final UserRepository users;
  private final Pseudonymizer pseudonymizer;
  private final EntityManager entityManager;

  public AuditQueryService(
      AuditLogRepository audit,
      AuditLogClientRepository clients,
      UserRepository users,
      Pseudonymizer pseudonymizer,
      EntityManager entityManager) {
    this.audit = audit;
    this.clients = clients;
    this.users = users;
    this.pseudonymizer = pseudonymizer;
    this.entityManager = entityManager;
  }

  /**
   * Página da trilha, da mais recente para a mais antiga, com cursor opaco {@code (occurred_at,
   * id)}. Não grava auditoria.
   */
  @Transactional(readOnly = true)
  public AuditPageView list(
      String from,
      String to,
      Long actorId,
      Long targetUserId,
      String action,
      String result,
      String cursor,
      Integer limit) {
    ApiException invalid = ApiException.validation("Há campos inválidos.");
    boolean hasErrors = false;

    Instant fromInstant = null;
    if (from != null && !from.isBlank()) {
      fromInstant = parseInstant(from);
      if (fromInstant == null) {
        invalid.withFieldError("from", "Data inicial inválida.");
        hasErrors = true;
      }
    }
    Instant toInstant = null;
    if (to != null && !to.isBlank()) {
      toInstant = parseInstant(to);
      if (toInstant == null) {
        invalid.withFieldError("to", "Data final inválida.");
        hasErrors = true;
      }
    }
    if (fromInstant != null && toInstant != null && fromInstant.isAfter(toInstant)) {
      invalid.withFieldError("from", "A data inicial não pode ser posterior à final.");
      hasErrors = true;
    }

    AuditAction actionEnum = null;
    if (action != null && !action.isBlank()) {
      actionEnum = parseAction(action);
      if (actionEnum == null) {
        invalid.withFieldError("action", "Ação inválida.");
        hasErrors = true;
      }
    }

    AuditResult resultEnum = null;
    if (result != null && !result.isBlank()) {
      resultEnum = parseResult(result);
      if (resultEnum == null) {
        invalid.withFieldError("result", "Resultado inválido.");
        hasErrors = true;
      }
    }

    KeysetCursor decodedCursor = null;
    if (cursor != null && !cursor.isBlank()) {
      try {
        decodedCursor = KeysetCursor.decode(cursor);
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

    List<AuditLog> rows =
        queryRows(
            fromInstant,
            toInstant,
            actorId,
            targetUserId,
            actionEnum,
            resultEnum,
            decodedCursor,
            pageLimit + 1);
    boolean hasMore = rows.size() > pageLimit;
    List<AuditLog> pageRows = hasMore ? rows.subList(0, pageLimit) : rows;
    Map<Long, String> labels = resolveLabels(pageRows);
    List<AuditEntryView> content = pageRows.stream().map(row -> view(row, labels, null)).toList();
    String nextCursor = null;
    if (hasMore) {
      AuditLog last = pageRows.get(pageRows.size() - 1);
      nextCursor = new KeysetCursor(last.getOccurredAt(), last.getId()).encode();
    }
    return new AuditPageView(content, nextCursor);
  }

  /**
   * Detalhe de um registro da trilha, incluindo {@code client} quando houver {@code client_ref}.
   * Não grava auditoria (mesmo em {@code 404}).
   */
  @Transactional(readOnly = true)
  public AuditEntryView detail(long auditId) {
    if (auditId <= 0) {
      throw new ApiException(ErrorCode.NOT_FOUND, "Registro de auditoria não encontrado.");
    }
    AuditLog row =
        audit
            .findById(auditId)
            .orElseThrow(
                () ->
                    new ApiException(ErrorCode.NOT_FOUND, "Registro de auditoria não encontrado."));
    Map<Long, String> labels = resolveLabels(List.of(row));
    AuditClientView clientView = resolveClient(row);
    return view(row, labels, clientView);
  }

  /** As últimas {@code limit} ações sobre o usuário, da mais recente para a mais antiga. */
  @Transactional(readOnly = true)
  public List<AuditEntryView> recentByTarget(long userId, int limit) {
    List<AuditLog> rows =
        audit.findByTargetUserIdOrderByOccurredAtDescIdDesc(userId, PageRequest.of(0, limit));
    Map<Long, String> labels = resolveLabels(rows);
    return rows.stream().map(row -> view(row, labels, null)).toList();
  }

  private List<AuditLog> queryRows(
      Instant from,
      Instant to,
      Long actorId,
      Long targetUserId,
      AuditAction action,
      AuditResult result,
      KeysetCursor cursor,
      int maxResults) {
    StringBuilder jpql = new StringBuilder("SELECT a FROM AuditLog a WHERE 1 = 1");
    Map<String, Object> params = new HashMap<>();
    if (from != null) {
      jpql.append(" AND a.occurredAt >= :from");
      params.put("from", from);
    }
    if (to != null) {
      jpql.append(" AND a.occurredAt < :to");
      params.put("to", to);
    }
    if (actorId != null) {
      jpql.append(" AND a.actorUserId = :actorId");
      params.put("actorId", actorId);
    }
    if (targetUserId != null) {
      jpql.append(" AND a.targetUserId = :targetUserId");
      params.put("targetUserId", targetUserId);
    }
    if (action != null) {
      jpql.append(" AND a.action = :action");
      params.put("action", action);
    }
    if (result != null) {
      jpql.append(" AND a.result = :result");
      params.put("result", result);
    }
    if (cursor != null) {
      jpql.append(
          " AND (a.occurredAt < :cursorAt OR (a.occurredAt = :cursorAt AND a.id < :cursorId))");
      params.put("cursorAt", cursor.occurredAt());
      params.put("cursorId", cursor.id());
    }
    jpql.append(" ORDER BY a.occurredAt DESC, a.id DESC");
    TypedQuery<AuditLog> query = entityManager.createQuery(jpql.toString(), AuditLog.class);
    params.forEach(query::setParameter);
    query.setMaxResults(maxResults);
    return query.getResultList();
  }

  private Map<Long, String> resolveLabels(List<AuditLog> rows) {
    Set<Long> ids = new HashSet<>();
    for (AuditLog row : rows) {
      addIfPresent(ids, row.getActorUserId());
      addIfPresent(ids, row.getTargetUserId());
    }
    if (ids.isEmpty()) {
      return Map.of();
    }
    return users.findAllById(ids).stream()
        .collect(Collectors.toMap(User::getId, AuditQueryService::label, (a, b) -> a));
  }

  private AuditClientView resolveClient(AuditLog row) {
    String rawRef = row.getClientRef();
    if (rawRef == null || rawRef.isBlank()) {
      return null;
    }
    String refLabel =
        "anônimo-"
            + (rawRef.length() >= CLIENT_REF_HEX ? rawRef.substring(0, CLIENT_REF_HEX) : rawRef);
    return clients
        .findById(row.getId())
        .map(c -> new AuditClientView(refLabel, c.getIp(), c.getDeviceLabel()))
        .orElseGet(() -> new AuditClientView(refLabel, null, null));
  }

  private AuditEntryView view(AuditLog row, Map<Long, String> labels, AuditClientView clientView) {
    Map<String, Object> filteredDetails = filterDetails(row.getDetails());
    return new AuditEntryView(
        row.getId(),
        row.getOccurredAt(),
        row.getAction(),
        row.getResult(),
        actor(row, labels),
        party(row.getTargetUserId(), labels),
        row.getSubject(),
        row.getReasonText(),
        row.getRefusalCode(),
        AuditSummary.of(row.getAction(), row.getResult()),
        filteredDetails,
        clientView);
  }

  private static Map<String, Object> filterDetails(Map<String, Object> raw) {
    if (raw == null || raw.isEmpty()) {
      return null;
    }
    Map<String, Object> clean = new LinkedHashMap<>();
    raw.forEach(
        (k, v) -> {
          if (KNOWN_DETAIL_KEYS.contains(k) && v != null) {
            clean.put(k, v);
          }
        });
    return clean.isEmpty() ? null : clean;
  }

  private PartyView actor(AuditLog row, Map<Long, String> labels) {
    return switch (row.getActorKind()) {
      case VISITOR -> new PartyView(null, VISITOR_LABEL);
      case SYSTEM -> new PartyView(null, SYSTEM_LABEL);
      case ADMIN, USER ->
          row.getActorUserId() == null
              ? new PartyView(null, UNKNOWN_LABEL)
              : party(row.getActorUserId(), labels);
    };
  }

  private PartyView party(Long userId, Map<Long, String> labels) {
    if (userId == null) {
      return null;
    }
    String label = labels.get(userId);
    return new PartyView(userId, label != null ? label : pseudonymizer.anonymousLabel(userId));
  }

  private static String label(User user) {
    String name = user.getName();
    return name != null && !name.isBlank() ? name : user.getEmail();
  }

  private static void addIfPresent(Set<Long> ids, Long id) {
    if (id != null) {
      ids.add(id);
    }
  }

  private static Instant parseInstant(String value) {
    if (value.indexOf('\0') >= 0) {
      return null;
    }
    try {
      return OffsetDateTime.parse(value.strip()).toInstant();
    } catch (DateTimeParseException e) {
      return null;
    }
  }

  private static AuditAction parseAction(String value) {
    if (value.indexOf('\0') >= 0) {
      return null;
    }
    for (AuditAction candidate : AuditAction.values()) {
      if (candidate.name().equals(value)) {
        return candidate;
      }
    }
    return null;
  }

  private static AuditResult parseResult(String value) {
    if (value.indexOf('\0') >= 0) {
      return null;
    }
    for (AuditResult candidate : AuditResult.values()) {
      if (candidate.name().equals(value)) {
        return candidate;
      }
    }
    return null;
  }
}
