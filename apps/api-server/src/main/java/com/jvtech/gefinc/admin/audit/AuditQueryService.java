package com.jvtech.gefinc.admin.audit;

import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Leitura mínima da trilha, só para o histórico do detalhe de um usuário ({@code recentActions}). A
 * consulta completa da auditoria (filtros, cursor) vem com a história da auditoria e estende este
 * serviço. Resolve quem agiu e quem sofreu a ação a partir de {@code users} (nome ou e-mail), com o
 * rótulo anônimo derivado do id quando a conta já não existe; nunca devolve IP.
 */
@Service
public class AuditQueryService {

  private static final String VISITOR_LABEL = "visitante";
  private static final String SYSTEM_LABEL = "sistema";
  private static final String UNKNOWN_LABEL = "desconhecido";

  private final AuditLogRepository audit;
  private final UserRepository users;
  private final Pseudonymizer pseudonymizer;

  public AuditQueryService(
      AuditLogRepository audit, UserRepository users, Pseudonymizer pseudonymizer) {
    this.audit = audit;
    this.users = users;
    this.pseudonymizer = pseudonymizer;
  }

  /** As últimas {@code limit} ações sobre o usuário, da mais recente para a mais antiga. */
  @Transactional(readOnly = true)
  public List<AuditEntryView> recentByTarget(long userId, int limit) {
    List<AuditLog> rows =
        audit.findByTargetUserIdOrderByOccurredAtDescIdDesc(userId, PageRequest.of(0, limit));
    Set<Long> ids = new HashSet<>();
    for (AuditLog row : rows) {
      addIfPresent(ids, row.getActorUserId());
      addIfPresent(ids, row.getTargetUserId());
    }
    Map<Long, String> labels =
        users.findAllById(ids).stream()
            .collect(Collectors.toMap(User::getId, AuditQueryService::label, (a, b) -> a));
    return rows.stream().map(row -> view(row, labels)).toList();
  }

  private AuditEntryView view(AuditLog row, Map<Long, String> labels) {
    Map<String, Object> details = row.getDetails();
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
        details == null || details.isEmpty() ? null : details);
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
}
