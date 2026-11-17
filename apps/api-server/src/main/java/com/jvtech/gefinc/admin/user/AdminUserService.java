package com.jvtech.gefinc.admin.user;

import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.audit.AuditDetails;
import com.jvtech.gefinc.admin.audit.AuditEntryView;
import com.jvtech.gefinc.admin.audit.AuditKey;
import com.jvtech.gefinc.admin.audit.AuditQueryService;
import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.admin.user.AdminUserRepository.Counts;
import com.jvtech.gefinc.admin.user.AdminUserRepository.Query;
import com.jvtech.gefinc.admin.user.AdminUserRepository.SortField;
import com.jvtech.gefinc.admin.user.AdminUserRepository.StatusFilter;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminDeletionInfo;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminLoginLock;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminUserCounts;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminUserDetail;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminUserPage;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.AdminUserRow;
import com.jvtech.gefinc.admin.user.UserPolicyDtos.PendingEmailChangeView;
import com.jvtech.gefinc.auth.LoginAttemptLimiter;
import com.jvtech.gefinc.common.config.AppProperties;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import com.jvtech.gefinc.user.UserRole;
import java.time.Clock;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Leitura de usuários para o painel. A lista e a busca não são auditadas; abrir o detalhe é: a
 * leitura e a linha {@code USER_DETAIL_OPENED} entram na mesma transação (audit-or-rollback), então
 * se a trilha falha nada é devolvido. Nenhum dado financeiro é lido aqui.
 */
@Service
public class AdminUserService {

  static final int RECENT_ACTIONS = 20;

  private final AdminUserRepository adminUsers;
  private final UserRepository users;
  private final PendingEmailChangeRepository pendingEmailChanges;
  private final AdminActionExecutor executor;
  private final AuditQueryService auditQuery;
  private final LoginAttemptLimiter loginLimiter;
  private final Pseudonymizer pseudonymizer;
  private final AppProperties.Admin settings;
  private final Clock clock;

  public AdminUserService(
      AdminUserRepository adminUsers,
      UserRepository users,
      PendingEmailChangeRepository pendingEmailChanges,
      AdminActionExecutor executor,
      AuditQueryService auditQuery,
      LoginAttemptLimiter loginLimiter,
      Pseudonymizer pseudonymizer,
      AppProperties properties,
      Clock clock) {
    this.adminUsers = adminUsers;
    this.users = users;
    this.pendingEmailChanges = pendingEmailChanges;
    this.executor = executor;
    this.auditQuery = auditQuery;
    this.loginLimiter = loginLimiter;
    this.pseudonymizer = pseudonymizer;
    this.settings = properties.admin();
    this.clock = clock;
  }

  /**
   * Página de usuários. Valores fora do contrato (tamanho, página, situação, ordenação, direção ou
   * busca longa demais) dão {@code 422} com um erro por campo.
   */
  @Transactional(readOnly = true)
  public AdminUserPage list(
      String q, String status, String sort, String dir, Integer page, Integer size) {
    ApiException invalid = ApiException.validation("Há campos inválidos.");
    boolean hasErrors = false;

    String text = q == null || q.isBlank() ? null : q.strip();
    if (text != null && text.length() > settings.searchMaxLength()) {
      invalid.withFieldError(
          "q", "A busca aceita até " + settings.searchMaxLength() + " caracteres.");
      hasErrors = true;
    } else if (text != null && text.indexOf('\0') >= 0) {
      // O PostgreSQL não aceita NUL em texto: sem esta checagem a consulta falharia com 500.
      invalid.withFieldError("q", "A busca contém caracteres inválidos.");
      hasErrors = true;
    }
    StatusFilter statusFilter = null;
    if (status != null && !status.isBlank()) {
      statusFilter = parseStatus(status);
      if (statusFilter == null) {
        invalid.withFieldError("status", "Situação inválida.");
        hasErrors = true;
      }
    }
    SortField sortField = SortField.CREATED_AT;
    if (sort != null && !sort.isBlank()) {
      sortField = parseSort(sort);
      if (sortField == null) {
        invalid.withFieldError("sort", "Ordenação inválida.");
        hasErrors = true;
      }
    }
    boolean ascending = false;
    if (dir != null && !dir.isBlank()) {
      if ("asc".equals(dir)) {
        ascending = true;
      } else if (!"desc".equals(dir)) {
        invalid.withFieldError("dir", "Direção inválida.");
        hasErrors = true;
      }
    }
    int pageNumber = page == null ? 0 : page;
    if (pageNumber < 0) {
      invalid.withFieldError("page", "A página não pode ser negativa.");
      hasErrors = true;
    }
    int pageSize = size == null ? settings.pageSize() : size;
    if (pageSize < 1 || pageSize > settings.maxPageSize()) {
      invalid.withFieldError(
          "size", "O tamanho da página vai de 1 a " + settings.maxPageSize() + ".");
      hasErrors = true;
    }
    if (hasErrors) {
      throw invalid;
    }

    Counts counts = adminUsers.counts(text);
    List<AdminUserRow> content =
        adminUsers.page(new Query(text, statusFilter, sortField, ascending, pageNumber, pageSize));
    return new AdminUserPage(
        content, pageNumber, pageSize, total(counts, statusFilter), counts.byStatus());
  }

  /**
   * Abre o detalhe. Id inexistente dá {@code 404}, auditado pelo executor sem alvo. O histórico
   * mostra as ações anteriores a esta abertura (a desta chamada é gravada logo depois da leitura).
   */
  public AdminUserDetail detail(long userId) {
    return executor.run(
        new AuditContext(AuditAction.USER_DETAIL_OPENED, userId, null, null, null),
        () -> read(userId));
  }

  /**
   * Altera o nome de exibição do usuário (efeito imediato, inclusive para o raiz). Valida
   * comprimento (máx 80) e caractere NUL. Audita USER_RENAMED com oldNameRef.
   */
  public AdminUserDetail rename(long userId, String name) {
    if (name != null && name.length() > 80) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("name", "O nome pode ter no máximo 80 caracteres.");
    }
    if (name != null && name.indexOf('\0') >= 0) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("name", "O nome contém caracteres inválidos.");
    }
    AtomicReference<String> oldNameRef = new AtomicReference<>();
    return executor.run(
        new AuditContext(
            AuditAction.USER_RENAMED,
            userId,
            null,
            null,
            () -> {
              AuditDetails details = AuditDetails.of();
              String old = oldNameRef.get();
              if (old != null && !old.isBlank()) {
                details.put(AuditKey.OLD_NAME_REF, pseudonymizer.nameRef(old));
              }
              return details;
            }),
        () -> {
          User target =
              users
                  .findById(userId)
                  .orElseThrow(
                      () -> new ApiException(ErrorCode.NOT_FOUND, "Usuário não encontrado."));
          oldNameRef.set(target.getName());
          target.rename(name);
          users.saveAndFlush(target);
          return read(userId);
        });
  }

  private AdminUserDetail read(long userId) {
    User user =
        users
            .findById(userId)
            .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Usuário não encontrado."));
    AdminLoginLock lock =
        loginLimiter.lockedUntil(user.getEmail()).map(AdminLoginLock::new).orElse(null);
    AdminDeletionInfo deletion =
        user.isDeletionPending()
            ? new AdminDeletionInfo(
                user.getDeletionOrigin(), user.getDeletionRequestedAt(), user.getDeletionDueAt())
            : null;
    List<AuditEntryView> recent = auditQuery.recentByTarget(userId, RECENT_ACTIONS);
    PendingEmailChangeView pendingEmailChange =
        pendingEmailChanges
            .findPending(userId)
            .filter(p -> !p.isExpired(clock.instant()))
            .map(
                p ->
                    new PendingEmailChangeView(
                        p.getNewEmail(), p.getExpiresAt(), p.getAttemptsLeft()))
            .orElse(null);
    return new AdminUserDetail(
        user.getId(),
        user.getEmail(),
        user.getName(),
        user.getCreatedAt(),
        user.getLastAccessAt(),
        user.getRole(),
        user.isSuspended(),
        user.isDeletionPending(),
        adminUsers.countOpenSessions(userId, clock.instant()),
        lock,
        deletion,
        pendingEmailChange,
        user.getRole() == UserRole.ROOT,
        recent);
  }

  private static long total(Counts counts, StatusFilter filter) {
    if (filter == null) {
      return counts.total();
    }
    AdminUserCounts by = counts.byStatus();
    return switch (filter) {
      case ACTIVE -> by.active();
      case SUSPENDED -> by.suspended();
      case DELETION_PENDING -> by.deletionPending();
      case ADMIN -> by.admin();
    };
  }

  private static StatusFilter parseStatus(String value) {
    for (StatusFilter filter : StatusFilter.values()) {
      if (filter.name().equals(value)) {
        return filter;
      }
    }
    return null;
  }

  private static SortField parseSort(String value) {
    return switch (value) {
      case "createdAt" -> SortField.CREATED_AT;
      case "lastAccessAt" -> SortField.LAST_ACCESS_AT;
      default -> null;
    };
  }
}
