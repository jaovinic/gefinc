package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.admin.audit.AdminDecisionAuditor;
import com.jvtech.gefinc.admin.audit.AdminDecisionAuditor.Decision;
import com.jvtech.gefinc.admin.deletion.AccountDeletionRequestRepository;
import com.jvtech.gefinc.admin.parameter.MaintenanceGuard;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.error.MaintenanceException;
import com.jvtech.gefinc.common.security.JwtService;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import com.jvtech.gefinc.user.UserRole;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Login, renovação e encerramento de sessão. */
@Service
public class AuthService {

  /** Prazo de carência para desistir da exclusão da conta. */
  public static final int DELETION_GRACE_DAYS = 30;

  private final UserRepository users;
  private final PasswordEncoder encoder;
  private final JwtService jwt;
  private final TokenService tokens;
  private final Clock clock;
  private final LoginAttemptLimiter limiter;
  private final AdminDecisionAuditor decisions;
  private final MaintenanceGuard maintenanceGuard;
  private final AccountDeletionRequestRepository deletionRepo;
  private final String dummyHash;

  public AuthService(
      UserRepository users,
      PasswordEncoder encoder,
      JwtService jwt,
      TokenService tokens,
      Clock clock,
      LoginAttemptLimiter limiter,
      AdminDecisionAuditor decisions,
      MaintenanceGuard maintenanceGuard,
      AccountDeletionRequestRepository deletionRepo) {
    this.users = users;
    this.encoder = encoder;
    this.jwt = jwt;
    this.tokens = tokens;
    this.clock = clock;
    this.limiter = limiter;
    this.decisions = decisions;
    this.maintenanceGuard = maintenanceGuard;
    this.deletionRepo = deletionRepo;
    // Comparação "de fachada" quando o e-mail não existe, para o tempo de resposta não revelá-lo.
    this.dummyHash = encoder.encode("senha-de-fachada-para-igualar-o-tempo");
  }

  @Transactional
  public Session login(String email, String password, String clientIp) {
    limiter.checkAllowed(email, clientIp);
    User user = users.findByEmail(email.strip()).orElse(null);
    boolean matches = matches(password, user == null ? dummyHash : user.getPasswordHash());
    if (user == null || !matches) {
      limiter.recordFailure(email, clientIp);
      throw invalidCredentials();
    }
    limiter.recordSuccess(email);
    if (maintenanceGuard.isMaintenanceActive() && user.getRole() == UserRole.USER) {
      throw new MaintenanceException(maintenanceGuard.getMaintenanceMessage());
    }
    // Só depois de credenciais corretas: senha errada segue o 401 comum e não revela a suspensão.
    if (user.isSuspended()) {
      decisions.revertAttempt(user.getId(), Decision.SUSPENSION);
      throw accountSuspended();
    }
    if (user.isDeletionPending()) {
      throw deletionPending(user);
    }
    users.touchAccess(user.getId(), clock.instant());
    TokenService.Issued issued = tokens.issueNewFamily(user.getId());
    return new Session(
        jwt.issueAccessToken(user.getId(), user.getTokenVersion(), issued.familyId()),
        jwt.accessTokenTtlSeconds(),
        issued.rawToken());
  }

  /**
   * Troca o token de renovação por um novo par; vazio se o token não vale mais. Dono suspenso: tudo
   * é revogado, a conta não é reativada e a resposta é {@code 403 ACCOUNT_SUSPENDED}; por isso a
   * transação não desfaz as revogações quando a exceção sai ({@code noRollbackFor}). Token já
   * revogado cujo dono está sob decisão administrativa também é registrado como tentativa.
   */
  @Transactional(noRollbackFor = ApiException.class)
  public Optional<Session> refresh(String rawRefreshToken) {
    if (maintenanceGuard.isMaintenanceActive()) {
      Long ownerId = tokens.ownerOf(rawRefreshToken).orElse(null);
      if (ownerId != null) {
        User owner = users.findById(ownerId).orElse(null);
        if (owner != null && owner.getRole() == UserRole.USER) {
          throw new MaintenanceException(maintenanceGuard.getMaintenanceMessage());
        }
      }
    }
    // Ordem global de travas: o usuário antes dos tokens (a ação administrativa faz o mesmo).
    tokens.ownerOf(rawRefreshToken).ifPresent(users::findForUpdate);
    TokenService.Rotation rotation = tokens.rotate(rawRefreshToken);
    if (!rotation.accepted()) {
      if (rotation.userId() != null) {
        users.findById(rotation.userId()).ifPresent(this::auditRevertAttempt);
      }
      return Optional.empty();
    }
    Optional<User> found = users.findById(rotation.userId());
    if (found.isEmpty()) {
      tokens.revokeAllOfUser(rotation.userId(), RevokedBy.SYSTEM);
      return Optional.empty();
    }
    User user = found.get();
    if (user.isSuspended()) {
      tokens.revokeAllOfUser(user.getId(), RevokedBy.SYSTEM);
      decisions.revertAttempt(user.getId(), Decision.SUSPENSION);
      throw accountSuspended();
    }
    if (user.isDeletionPending()) {
      tokens.revokeAllOfUser(user.getId(), RevokedBy.SYSTEM);
      auditRevertAttempt(user);
      return Optional.empty();
    }
    users.touchAccess(user.getId(), clock.instant());
    return Optional.of(
        new Session(
            jwt.issueAccessToken(user.getId(), user.getTokenVersion(), rotation.familyId()),
            jwt.accessTokenTtlSeconds(),
            rotation.newRawToken()));
  }

  /** Registra a tentativa de quem está sob decisão administrativa; usuário comum não gera nada. */
  private void auditRevertAttempt(User user) {
    if (user.isSuspended()) {
      decisions.revertAttempt(user.getId(), Decision.SUSPENSION);
    } else if (user.isDeletionByAdmin()) {
      decisions.revertAttempt(user.getId(), Decision.ADMIN_DELETION);
    }
  }

  public void logout(String rawRefreshToken) {
    if (rawRefreshToken != null && !rawRefreshToken.isBlank()) {
      tokens.revokeFamilyOf(rawRefreshToken);
    }
  }

  /** Confere a senha de um usuário (confirmação de ações sensíveis). */
  public boolean matches(String rawPassword, String hash) {
    try {
      return encoder.matches(rawPassword, hash);
    } catch (IllegalArgumentException e) {
      // Senha acima de 72 bytes: o BCrypt a recusa; para o chamador é só "credencial inválida".
      return false;
    }
  }

  public LocalDate deletionDate(User user) {
    java.time.Instant target =
        user.getDeletionDueAt() != null
            ? user.getDeletionDueAt()
            : user.getDeletionRequestedAt().plus(java.time.Duration.ofDays(DELETION_GRACE_DAYS));
    return LocalDate.ofInstant(target, clock.getZone());
  }

  public static ApiException invalidCredentials() {
    return new ApiException(ErrorCode.INVALID_CREDENTIALS, "E-mail ou senha incorretos.");
  }

  /** Conta suspensa: orienta procurar o suporte e nunca revela o motivo. */
  public static ApiException accountSuspended() {
    return new ApiException(
            ErrorCode.ACCOUNT_SUSPENDED,
            "Sua conta está suspensa. Procure o suporte para saber mais.")
        .with("supportHint", "Entre em contato com o suporte para entender a situação da conta.");
  }

  /** Exclusão pedida por um administrador: o usuário não a desfaz. */
  public static ApiException adminDecisionLocked() {
    return new ApiException(
            ErrorCode.ADMIN_DECISION_LOCKED,
            "A exclusão desta conta foi decidida pela administração e não pode ser cancelada.")
        .with("supportHint", "Entre em contato com o suporte para saber mais.");
  }

  private ApiException deletionPending(User user) {
    boolean adminOrigin = user.isDeletionByAdmin();
    String origin = adminOrigin ? "ADMIN" : "USER";
    boolean canCancel = !adminOrigin;
    String supportHint =
        adminOrigin
            ? "Entre em contato com o suporte para entender a situação da conta."
            : "Entre com suas credenciais para cancelar a exclusão.";
    String message =
        adminOrigin
            ? "A exclusão desta conta foi solicitada pela administração e não pode ser cancelada."
            : "A exclusão desta conta está agendada. Entre com suas credenciais para cancelá-la.";

    ApiException ex =
        new ApiException(ErrorCode.ACCOUNT_DELETION_PENDING, message)
            .with("deletionDate", deletionDate(user))
            .with("origin", origin)
            .with("canCancel", canCancel)
            .with("supportHint", supportHint);

    if (adminOrigin && user.getDeletionRequestId() != null) {
      deletionRepo
          .findById(user.getDeletionRequestId())
          .ifPresent(req -> ex.with("reasonMessage", req.getReasonMessage()));
    }
    return ex;
  }

  /** Par de tokens emitido pelo login ou pela renovação. */
  public record Session(String accessToken, long expiresIn, String refreshToken) {
    /** Sem dados do usuário em logs: o valor nunca é impresso (FR-003). */
    @Override
    public String toString() {
      return "Session[REDACTED]";
    }
  }
}
