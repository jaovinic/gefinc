package com.jvtech.gefinc.admin.invitation;

import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.audit.AuditDetails;
import com.jvtech.gefinc.admin.audit.AuditKey;
import com.jvtech.gefinc.admin.audit.PartyView;
import com.jvtech.gefinc.admin.common.AdminActionExecutor;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import com.jvtech.gefinc.admin.invitation.InvitationDtos.InvitationPreview;
import com.jvtech.gefinc.admin.invitation.InvitationDtos.InvitationView;
import com.jvtech.gefinc.admin.parameter.MaintenanceGuard;
import com.jvtech.gefinc.auth.PasswordPolicy;
import com.jvtech.gefinc.auth.TokenService;
import com.jvtech.gefinc.common.config.AppProperties;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.mail.DeliveryMode;
import com.jvtech.gefinc.common.mail.MailKind;
import com.jvtech.gefinc.common.mail.MailOutcome;
import com.jvtech.gefinc.common.mail.MailService;
import com.jvtech.gefinc.common.mail.MailTemplates;
import com.jvtech.gefinc.common.mail.OutgoingMail;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRegisteredEvent;
import com.jvtech.gefinc.user.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InvitationService {

  private static final String INVITATION_SUBJECT = "GEFINC: convite para criar sua conta";

  private final InvitationRepository invitations;
  private final UserRepository users;
  private final MailService mailService;
  private final AdminActionExecutor executor;
  private final Pseudonymizer pseudonymizer;
  private final PasswordPolicy passwordPolicy;
  private final PasswordEncoder encoder;
  private final ApplicationEventPublisher events;
  private final MaintenanceGuard maintenanceGuard;
  private final AppProperties properties;
  private final Clock clock;

  public InvitationService(
      InvitationRepository invitations,
      UserRepository users,
      MailService mailService,
      AdminActionExecutor executor,
      Pseudonymizer pseudonymizer,
      PasswordPolicy passwordPolicy,
      PasswordEncoder encoder,
      ApplicationEventPublisher events,
      MaintenanceGuard maintenanceGuard,
      AppProperties properties,
      Clock clock) {
    this.invitations = invitations;
    this.users = users;
    this.mailService = mailService;
    this.executor = executor;
    this.pseudonymizer = pseudonymizer;
    this.passwordPolicy = passwordPolicy;
    this.encoder = encoder;
    this.events = events;
    this.maintenanceGuard = maintenanceGuard;
    this.properties = properties;
    this.clock = clock;
  }

  /**
   * Cria um novo convite ou reenvia caso já exista um convite PENDING para o mesmo e-mail. Se já
   * houver usuário cadastrado com esse e-mail, recusa com 409 EMAIL_ALREADY_REGISTERED.
   */
  public InvitationView createOrResend(String email) {
    String normalized = email.strip().toLowerCase(Locale.ROOT);
    if (users.existsByEmail(normalized)) {
      throw new ApiException(ErrorCode.EMAIL_ALREADY_REGISTERED, "Este e-mail já está cadastrado.");
    }

    Optional<Invitation> existingPending =
        invitations.findByEmailAndStatus(normalized, InvitationStatus.PENDING);

    if (existingPending.isPresent()) {
      Invitation existing = existingPending.get();
      return executor.run(
          new AuditContext(
              AuditAction.INVITATION_RESENT,
              null,
              String.valueOf(existing.getId()),
              null,
              () -> AuditDetails.of().put(AuditKey.EMAIL_REF, existing.getEmailRef())),
          () -> {
            String rawToken = TokenService.newRawToken();
            Instant now = clock.instant();
            existing.resend(TokenService.hash(rawToken), now.plus(invitationTtl()));
            invitations.saveAndFlush(existing);
            sendMail(normalized, rawToken);
            return toView(existing);
          });
    }

    AtomicReference<String> subjectRef = new AtomicReference<>();
    AtomicReference<String> emailRefHolder = new AtomicReference<>();
    return executor.runWithDynamicSubject(
        AuditAction.INVITATION_CREATED,
        subjectRef,
        () -> AuditDetails.of().put(AuditKey.EMAIL_REF, emailRefHolder.get()),
        () -> {
          String rawToken = TokenService.newRawToken();
          Instant now = clock.instant();
          String emailRef = pseudonymizer.emailRef(normalized);
          emailRefHolder.set(emailRef);

          Invitation inv =
              new Invitation(
                  normalized,
                  emailRef,
                  TokenService.hash(rawToken),
                  now.plus(invitationTtl()),
                  CurrentUser.id(),
                  now);
          Invitation saved = invitations.saveAndFlush(inv);
          subjectRef.set(String.valueOf(saved.getId()));
          sendMail(normalized, rawToken);
          return toView(saved);
        });
  }

  /** Reenvio manual de convite pendente por ID. Gera novo link e prorroga a validade em 7 dias. */
  public void resend(long invitationId) {
    Invitation inv =
        invitations
            .findById(invitationId)
            .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Convite não encontrado."));

    if (inv.getStatus() != InvitationStatus.PENDING) {
      throw new ApiException(ErrorCode.CONFLICT, "Apenas convites pendentes podem ser reenviados.");
    }

    executor.run(
        new AuditContext(
            AuditAction.INVITATION_RESENT,
            null,
            String.valueOf(inv.getId()),
            null,
            () -> AuditDetails.of().put(AuditKey.EMAIL_REF, inv.getEmailRef())),
        () -> {
          String rawToken = TokenService.newRawToken();
          Instant now = clock.instant();
          inv.resend(TokenService.hash(rawToken), now.plus(invitationTtl()));
          invitations.saveAndFlush(inv);
          sendMail(inv.getEmail(), rawToken);
          return null;
        });
  }

  /** Cancela convite pendente. Zera o e-mail em claro respeitando ck_inv_email. */
  public void cancel(long invitationId) {
    Invitation inv =
        invitations
            .findById(invitationId)
            .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Convite não encontrado."));

    if (inv.getStatus() != InvitationStatus.PENDING) {
      throw new ApiException(ErrorCode.CONFLICT, "Apenas convites pendentes podem ser cancelados.");
    }

    executor.run(
        new AuditContext(
            AuditAction.INVITATION_CANCELED,
            null,
            String.valueOf(inv.getId()),
            null,
            () -> AuditDetails.of().put(AuditKey.EMAIL_REF, inv.getEmailRef())),
        () -> {
          inv.cancel(clock.instant());
          invitations.saveAndFlush(inv);
          return null;
        });
  }

  /** Lista convites para o painel administrativo. Não é auditada. */
  @Transactional(readOnly = true)
  public List<InvitationView> list(String statusStr) {
    InvitationStatus filter = null;
    if (statusStr != null && !statusStr.isBlank()) {
      try {
        filter = InvitationStatus.valueOf(statusStr.strip().toUpperCase(Locale.ROOT));
      } catch (IllegalArgumentException e) {
        throw ApiException.validation("Situação inválida.")
            .withFieldError("status", "Situação inválida.");
      }
    }

    List<Invitation> list =
        filter != null
            ? invitations.findByStatusOrderByCreatedAtDescIdDesc(filter)
            : invitations.findAllByOrderByCreatedAtDescIdDesc();

    Set<Long> userIds =
        list.stream()
            .map(Invitation::getInvitedBy)
            .filter(id -> id != null)
            .collect(Collectors.toSet());
    Map<Long, User> userMap =
        users.findAllById(userIds).stream().collect(Collectors.toMap(User::getId, u -> u));

    return list.stream().map(inv -> toViewWithMap(inv, userMap)).toList();
  }

  /** Consulta pública de prévia de um convite de cadastro. */
  @Transactional(readOnly = true)
  public InvitationPreview preview(String rawToken) {
    if (rawToken == null || rawToken.isBlank()) {
      throw new ApiException(ErrorCode.NOT_FOUND, "Convite não encontrado.");
    }
    String tokenHash = TokenService.hash(rawToken);
    Invitation inv =
        invitations
            .findByTokenHash(tokenHash)
            .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Convite não encontrado."));

    if (inv.getStatus() != InvitationStatus.PENDING || inv.isExpired(clock.instant())) {
      throw new ApiException(ErrorCode.INVITATION_EXPIRED, "Convite inválido ou expirado.");
    }

    return new InvitationPreview(inv.getEmail(), inv.getExpiresAt());
  }

  /**
   * Aceite público de convite de cadastro. Cria a conta do usuário mesmo se os cadastros comuns
   * estiverem fechados, mas respeita manutenção ativa (503).
   */
  @Transactional
  public User accept(String rawToken, String password, String name) {
    maintenanceGuard.checkMaintenance();

    if (rawToken == null || rawToken.isBlank()) {
      throw new ApiException(ErrorCode.NOT_FOUND, "Convite não encontrado.");
    }
    String tokenHash = TokenService.hash(rawToken);
    Invitation inv =
        invitations
            .findByTokenHash(tokenHash)
            .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Convite não encontrado."));

    if (inv.getStatus() != InvitationStatus.PENDING || inv.isExpired(clock.instant())) {
      throw new ApiException(ErrorCode.INVITATION_EXPIRED, "Convite inválido ou expirado.");
    }

    passwordPolicy
        .violation(password)
        .ifPresent(
            reason -> {
              throw ApiException.validation(reason);
            });

    String email = inv.getEmail();
    if (users.existsByEmail(email)) {
      throw new ApiException(ErrorCode.EMAIL_ALREADY_REGISTERED, "Este e-mail já está cadastrado.");
    }

    try {
      User user = new User(email, encoder.encode(password), clock.instant());
      if (name != null && !name.isBlank()) {
        user.rename(name);
      }
      user = users.saveAndFlush(user);
      events.publishEvent(new UserRegisteredEvent(user.getId()));

      inv.accept(user.getId(), clock.instant());
      invitations.saveAndFlush(inv);
      return user;
    } catch (DataIntegrityViolationException e) {
      throw new ApiException(ErrorCode.EMAIL_ALREADY_REGISTERED, "Este e-mail já está cadastrado.");
    }
  }

  /** Consome convite pendente se houver no momento do auto-cadastro (/auth/register). */
  @Transactional
  public void consumePendingIfExists(String email, long userId) {
    invitations
        .findByEmailAndStatus(email, InvitationStatus.PENDING)
        .ifPresent(
            inv -> {
              inv.accept(userId, clock.instant());
              invitations.saveAndFlush(inv);
            });
  }

  private Duration invitationTtl() {
    return properties.admin().invitationTtl();
  }

  private void sendMail(String email, String rawToken) {
    String link = properties.baseUrl() + "/invitations/" + rawToken;
    String body = MailTemplates.render("invitation", Map.of("validade", "7 dias", "link", link));
    OutgoingMail mail =
        new OutgoingMail(MailKind.INVITATION, email, INVITATION_SUBJECT, body, null);
    MailOutcome outcome = mailService.send(mail, DeliveryMode.SYNC_ONCE);
    if (!outcome.sent()) {
      throw new ApiException(
          ErrorCode.MAIL_DELIVERY_FAILED,
          "Falha no envio do e-mail de convite. Nenhuma alteração foi aplicada.");
    }
  }

  private InvitationView toView(Invitation inv) {
    PartyView party;
    if (inv.getInvitedBy() != null) {
      party =
          users
              .findById(inv.getInvitedBy())
              .map(u -> new PartyView(u.getId(), u.getEmail()))
              .orElse(
                  new PartyView(
                      inv.getInvitedBy(), pseudonymizer.anonymousLabel(inv.getInvitedBy())));
    } else {
      party = new PartyView(null, "sistema");
    }
    String email = inv.getStatus() == InvitationStatus.PENDING ? inv.getEmail() : null;
    return new InvitationView(
        inv.getId(), email, inv.getStatus(), party, inv.getCreatedAt(), inv.getExpiresAt());
  }

  private InvitationView toViewWithMap(Invitation inv, Map<Long, User> userMap) {
    PartyView party;
    if (inv.getInvitedBy() != null) {
      User user = userMap.get(inv.getInvitedBy());
      if (user != null) {
        party = new PartyView(user.getId(), user.getEmail());
      } else {
        party = new PartyView(inv.getInvitedBy(), pseudonymizer.anonymousLabel(inv.getInvitedBy()));
      }
    } else {
      party = new PartyView(null, "sistema");
    }
    String email = inv.getStatus() == InvitationStatus.PENDING ? inv.getEmail() : null;
    return new InvitationView(
        inv.getId(), email, inv.getStatus(), party, inv.getCreatedAt(), inv.getExpiresAt());
  }
}
