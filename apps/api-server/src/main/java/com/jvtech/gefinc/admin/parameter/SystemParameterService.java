package com.jvtech.gefinc.admin.parameter;

import com.jvtech.gefinc.admin.audit.ActorKind;
import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.audit.AuditDetails;
import com.jvtech.gefinc.admin.audit.AuditEntry;
import com.jvtech.gefinc.admin.audit.AuditKey;
import com.jvtech.gefinc.admin.audit.AuditService;
import com.jvtech.gefinc.admin.audit.PartyView;
import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.admin.parameter.ParameterDtos.EditableParameterView;
import com.jvtech.gefinc.admin.parameter.ParameterDtos.ParametersView;
import com.jvtech.gefinc.admin.parameter.ParameterDtos.ReadOnlyParameterView;
import com.jvtech.gefinc.auth.AuthService;
import com.jvtech.gefinc.common.config.AppProperties;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.user.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Leitura e alteração dos parâmetros do sistema com snapshot em memória e auditoria. Linha ausente
 * na tabela equivale ao valor padrão (resiliência a TRUNCATE em testes).
 */
@Service
public class SystemParameterService {

  public static final String SIGNUPS_OPEN_KEY = "SIGNUPS_OPEN";
  public static final String MAINTENANCE_ENABLED_KEY = "MAINTENANCE_ENABLED";
  public static final String MAINTENANCE_MESSAGE_KEY = "MAINTENANCE_MESSAGE";

  private static final String DEFAULT_SIGNUPS_OPEN = "true";
  private static final String DEFAULT_MAINTENANCE_ENABLED = "false";
  private static final String DEFAULT_MAINTENANCE_MESSAGE = "";

  private static final String DELETED_ADMIN_LABEL = "Administrador excluído";

  private final SystemParameterRepository repository;
  private final UserRepository userRepository;
  private final AdminActionExecutor executor;
  private final AuditService audit;
  private final AppProperties properties;
  private final Clock clock;

  // Snapshot volátil em memória; invalidado/atualizado ao alterar
  private final Map<String, String> cache = new ConcurrentHashMap<>();
  private volatile boolean cacheInitialized = false;

  public SystemParameterService(
      SystemParameterRepository repository,
      UserRepository userRepository,
      AdminActionExecutor executor,
      AuditService audit,
      AppProperties properties,
      Clock clock) {
    this.repository = repository;
    this.userRepository = userRepository;
    this.executor = executor;
    this.audit = audit;
    this.properties = properties;
    this.clock = clock;
  }

  public void invalidateCache() {
    cache.clear();
    cacheInitialized = false;
  }

  private void ensureCache() {
    if (!cacheInitialized) {
      synchronized (this) {
        if (!cacheInitialized) {
          cache.put(SIGNUPS_OPEN_KEY, DEFAULT_SIGNUPS_OPEN);
          cache.put(MAINTENANCE_ENABLED_KEY, DEFAULT_MAINTENANCE_ENABLED);
          cache.put(MAINTENANCE_MESSAGE_KEY, DEFAULT_MAINTENANCE_MESSAGE);
          for (SystemParameter param : repository.findAll()) {
            cache.put(param.getKey(), param.getValue());
          }
          cacheInitialized = true;
        }
      }
    }
  }

  public boolean isSignupsOpen() {
    ensureCache();
    return Boolean.parseBoolean(cache.getOrDefault(SIGNUPS_OPEN_KEY, DEFAULT_SIGNUPS_OPEN));
  }

  public boolean isMaintenanceEnabled() {
    ensureCache();
    return Boolean.parseBoolean(
        cache.getOrDefault(MAINTENANCE_ENABLED_KEY, DEFAULT_MAINTENANCE_ENABLED));
  }

  public String getMaintenanceMessage() {
    ensureCache();
    return cache.getOrDefault(MAINTENANCE_MESSAGE_KEY, DEFAULT_MAINTENANCE_MESSAGE);
  }

  @Transactional(readOnly = true)
  public ParametersView getParameters() {
    Map<String, SystemParameter> fromDb = new LinkedHashMap<>();
    for (SystemParameter param : repository.findAll()) {
      fromDb.put(param.getKey(), param);
    }

    List<EditableParameterView> editable = new ArrayList<>();
    Instant now = clock.instant();

    // 1. SIGNUPS_OPEN
    SystemParameter signupsParam = fromDb.get(SIGNUPS_OPEN_KEY);
    editable.add(
        new EditableParameterView(
            SIGNUPS_OPEN_KEY,
            signupsParam != null ? signupsParam.getValue() : DEFAULT_SIGNUPS_OPEN,
            signupsParam != null ? signupsParam.getUpdatedAt() : now,
            resolveParty(signupsParam != null ? signupsParam.getUpdatedBy() : null)));

    // 2. MAINTENANCE_ENABLED
    SystemParameter maintEnabledParam = fromDb.get(MAINTENANCE_ENABLED_KEY);
    editable.add(
        new EditableParameterView(
            MAINTENANCE_ENABLED_KEY,
            maintEnabledParam != null ? maintEnabledParam.getValue() : DEFAULT_MAINTENANCE_ENABLED,
            maintEnabledParam != null ? maintEnabledParam.getUpdatedAt() : now,
            resolveParty(maintEnabledParam != null ? maintEnabledParam.getUpdatedBy() : null)));

    // 3. MAINTENANCE_MESSAGE
    SystemParameter maintMsgParam = fromDb.get(MAINTENANCE_MESSAGE_KEY);
    editable.add(
        new EditableParameterView(
            MAINTENANCE_MESSAGE_KEY,
            maintMsgParam != null ? maintMsgParam.getValue() : DEFAULT_MAINTENANCE_MESSAGE,
            maintMsgParam != null ? maintMsgParam.getUpdatedAt() : now,
            resolveParty(maintMsgParam != null ? maintMsgParam.getUpdatedBy() : null)));

    // Read-only parameters
    List<ReadOnlyParameterView> readOnly = new ArrayList<>();

    Duration refreshTtl =
        properties.security() != null && properties.security().refreshTokenTtl() != null
            ? properties.security().refreshTokenTtl()
            : Duration.ofDays(7);
    readOnly.add(
        new ReadOnlyParameterView(
            "REFRESH_TOKEN_TTL", formatDuration(refreshTtl), "Validade da sessão"));

    Duration accessTtl =
        properties.security() != null && properties.security().accessTokenTtl() != null
            ? properties.security().accessTokenTtl()
            : Duration.ofMinutes(15);
    readOnly.add(
        new ReadOnlyParameterView(
            "ACCESS_TOKEN_TTL", formatDuration(accessTtl), "Validade do token de acesso"));

    readOnly.add(
        new ReadOnlyParameterView(
            "LOGIN_MAX_FAILURES_EMAIL",
            "5 tentativas por e-mail em 15 minutos",
            "Limite de tentativas por e-mail"));

    readOnly.add(
        new ReadOnlyParameterView(
            "LOGIN_MAX_FAILURES_IP",
            "20 tentativas por IP em 15 minutos",
            "Limite de tentativas por IP"));

    readOnly.add(
        new ReadOnlyParameterView(
            "ACCOUNT_DELETION_GRACE_DAYS",
            AuthService.DELETION_GRACE_DAYS + " dias",
            "Prazo de carência para exclusão de conta"));

    int mutatingRate =
        properties.admin() != null && properties.admin().rate() != null
            ? properties.admin().rate().mutatingPerMinute()
            : 30;
    readOnly.add(
        new ReadOnlyParameterView(
            "ADMIN_RATE_MUTATING",
            mutatingRate + " solicitações por minuto",
            "Limite de taxa do painel (geral)"));

    int destructiveRate =
        properties.admin() != null && properties.admin().rate() != null
            ? properties.admin().rate().destructivePerWindow()
            : 10;
    Duration destructiveWin =
        properties.admin() != null && properties.admin().rate() != null
            ? properties.admin().rate().destructiveWindow()
            : Duration.ofMinutes(15);
    readOnly.add(
        new ReadOnlyParameterView(
            "ADMIN_RATE_DESTRUCTIVE",
            destructiveRate + " a cada " + formatDuration(destructiveWin),
            "Limite de ações destrutivas"));

    int reauthFailures = properties.admin() != null ? properties.admin().reauthMaxFailures() : 5;
    readOnly.add(
        new ReadOnlyParameterView(
            "ADMIN_REAUTH_MAX_FAILURES",
            reauthFailures + " falhas consecutivas revogam a sessão",
            "Limite de erros de reautenticação"));

    return new ParametersView(editable, readOnly);
  }

  private PartyView resolveParty(Long userId) {
    if (userId == null) {
      return null;
    }
    return userRepository
        .findById(userId)
        .map(u -> new PartyView(u.getId(), u.getEmail()))
        .orElse(new PartyView(null, DELETED_ADMIN_LABEL));
  }

  private static String formatDuration(Duration d) {
    long days = d.toDays();
    if (days > 0) {
      return days == 1 ? "1 dia" : days + " dias";
    }
    long hours = d.toHours();
    if (hours > 0) {
      return hours == 1 ? "1 hora" : hours + " horas";
    }
    long minutes = d.toMinutes();
    return minutes == 1 ? "1 minuto" : minutes + " minutos";
  }

  public void setSignupsOpen(boolean open) {
    AtomicReference<String> prev = new AtomicReference<>();
    String newValue = String.valueOf(open);
    Long actorId = CurrentUser.id();

    executor.run(
        new AuditContext(
            AuditAction.PARAMETER_CHANGED,
            null,
            SIGNUPS_OPEN_KEY,
            null,
            () ->
                AuditDetails.of()
                    .put(AuditKey.PARAMETER, SIGNUPS_OPEN_KEY)
                    .put(AuditKey.FROM, prev.get())
                    .put(AuditKey.TO, newValue)),
        () -> {
          SystemParameter param =
              repository
                  .findByKey(SIGNUPS_OPEN_KEY)
                  .orElseGet(
                      () ->
                          new SystemParameter(
                              SIGNUPS_OPEN_KEY, DEFAULT_SIGNUPS_OPEN, clock.instant(), actorId));
          prev.set(param.getValue());
          param.setValue(newValue);
          param.setUpdatedAt(clock.instant());
          param.setUpdatedBy(actorId);
          repository.save(param);
          cache.put(SIGNUPS_OPEN_KEY, newValue);
          return null;
        });
  }

  public void setMaintenance(boolean enabled, String message) {
    String trimmedMsg = message != null ? message.trim() : "";
    if (trimmedMsg.length() > 280) {
      throw ApiException.validation("A mensagem de manutenção deve ter no máximo 280 caracteres.");
    }
    if (trimmedMsg.indexOf('\0') >= 0) {
      throw ApiException.validation("A mensagem de manutenção não pode conter caracteres nulos.");
    }
    String newEnabled = String.valueOf(enabled);
    Long actorId = CurrentUser.id();

    AtomicReference<String> prevEnabled = new AtomicReference<>();
    AtomicReference<String> prevMessage = new AtomicReference<>();

    executor.run(
        new AuditContext(
            AuditAction.PARAMETER_CHANGED,
            null,
            MAINTENANCE_ENABLED_KEY,
            null,
            () ->
                AuditDetails.of()
                    .put(AuditKey.PARAMETER, MAINTENANCE_ENABLED_KEY)
                    .put(AuditKey.FROM, prevEnabled.get())
                    .put(AuditKey.TO, newEnabled)),
        () -> {
          Instant now = clock.instant();

          SystemParameter enabledParam =
              repository
                  .findByKey(MAINTENANCE_ENABLED_KEY)
                  .orElseGet(
                      () ->
                          new SystemParameter(
                              MAINTENANCE_ENABLED_KEY, DEFAULT_MAINTENANCE_ENABLED, now, actorId));
          prevEnabled.set(enabledParam.getValue());
          enabledParam.setValue(newEnabled);
          enabledParam.setUpdatedAt(now);
          enabledParam.setUpdatedBy(actorId);
          repository.save(enabledParam);
          cache.put(MAINTENANCE_ENABLED_KEY, newEnabled);

          SystemParameter msgParam =
              repository
                  .findByKey(MAINTENANCE_MESSAGE_KEY)
                  .orElseGet(
                      () ->
                          new SystemParameter(
                              MAINTENANCE_MESSAGE_KEY, DEFAULT_MAINTENANCE_MESSAGE, now, actorId));
          prevMessage.set(msgParam.getValue());
          msgParam.setValue(trimmedMsg);
          msgParam.setUpdatedAt(now);
          msgParam.setUpdatedBy(actorId);
          repository.save(msgParam);
          cache.put(MAINTENANCE_MESSAGE_KEY, trimmedMsg);

          if (!Objects.equals(prevMessage.get(), trimmedMsg)) {
            audit.record(
                AuditEntry.builder(AuditAction.PARAMETER_CHANGED)
                    .actor(ActorKind.ADMIN, actorId)
                    .subject(MAINTENANCE_MESSAGE_KEY)
                    .details(
                        AuditDetails.of()
                            .put(AuditKey.PARAMETER, MAINTENANCE_MESSAGE_KEY)
                            .put(AuditKey.FROM, prevMessage.get())
                            .put(AuditKey.TO, trimmedMsg))
                    .build());
          }

          return null;
        });
  }
}
