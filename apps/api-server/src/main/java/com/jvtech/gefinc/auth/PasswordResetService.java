package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.common.config.AppProperties;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.mail.MailKind;
import com.jvtech.gefinc.common.mail.MailTemplates;
import com.jvtech.gefinc.common.mail.OutgoingMail;
import com.jvtech.gefinc.common.mail.PasswordResetMailRequested;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Recuperação de senha por link de uso único enviado ao e-mail cadastrado. */
@Service
public class PasswordResetService {

  static final Duration LINK_VALIDITY = Duration.ofMinutes(60);
  private static final String PASSWORD_RESET_SUBJECT = "GEFINC: redefinição de senha";

  private final UserRepository users;
  private final PasswordResetTokenRepository resetTokens;
  private final PasswordResetRateLimiter rateLimiter;
  private final PasswordPolicy policy;
  private final PasswordEncoder encoder;
  private final TokenService tokens;
  private final ApplicationEventPublisher events;
  private final AppProperties properties;
  private final Clock clock;

  public PasswordResetService(
      UserRepository users,
      PasswordResetTokenRepository resetTokens,
      PasswordResetRateLimiter rateLimiter,
      PasswordPolicy policy,
      PasswordEncoder encoder,
      TokenService tokens,
      ApplicationEventPublisher events,
      AppProperties properties,
      Clock clock) {
    this.users = users;
    this.resetTokens = resetTokens;
    this.rateLimiter = rateLimiter;
    this.policy = policy;
    this.encoder = encoder;
    this.tokens = tokens;
    this.events = events;
    this.properties = properties;
    this.clock = clock;
  }

  /**
   * Resposta sempre igual, exista a conta ou não. Para contas existentes, invalida os links
   * anteriores e agenda o envio de um novo; o e-mail só sai de forma assíncrona depois do commit,
   * sem segurar a conexão do banco durante o SMTP e sem diferença de tempo observável por conta.
   */
  @Transactional
  public void request(String email) {
    rateLimiter.acquire(email);
    users
        .findByEmail(email.strip())
        .ifPresent(
            user -> {
              Instant now = clock.instant();
              resetTokens.invalidateOpenTokens(user.getId(), now);
              String raw = TokenService.newRawToken();
              resetTokens.save(
                  new PasswordResetToken(
                      user.getId(), TokenService.hash(raw), now.plus(LINK_VALIDITY), now));
              events.publishEvent(
                  new PasswordResetMailRequested(
                      user.getEmail(),
                      properties.baseUrl() + "/reset-password?token=" + raw,
                      user.getId()));
            });
  }

  @Transactional
  public void confirm(String rawToken, String newPassword) {
    Instant now = clock.instant();
    String tokenHash = TokenService.hash(rawToken);
    // Ordem global de travas (ver AdminPolicy): o usuário antes do link, e o link já relido sob a
    // trava, então um uso concorrente do mesmo link é visto como usado.
    Optional<User> owner =
        resetTokens.findOwnerByTokenHash(tokenHash).flatMap(users::findForUpdate);
    PasswordResetToken token =
        owner
            .flatMap(user -> resetTokens.findByTokenHash(tokenHash))
            .filter(t -> t.isUsable(now))
            .orElseThrow(
                () ->
                    new ApiException(
                        ErrorCode.INVALID_RESET_TOKEN,
                        "Este link é inválido, já foi usado ou expirou. Solicite um novo."));
    policy
        .violation(newPassword)
        .ifPresent(
            reason -> {
              throw ApiException.validation(reason);
            });
    User user = owner.orElseThrow();
    user.changePassword(encoder.encode(newPassword));
    token.markUsed(now);
    resetTokens.invalidateOpenTokens(user.getId(), now);
    tokens.revokeAllOfUser(user.getId(), RevokedBy.USER);
  }

  /**
   * Hash BCrypt de um segredo aleatório de 256 bits que ninguém conhece. Calculado antes de travar
   * a linha do usuário ({@code findForUpdate}), para não segurar a trava durante o BCrypt (A32).
   */
  public String newUnmatchablePasswordHash() {
    return encoder.encode(TokenService.newRawToken());
  }

  /**
   * Invalida os links anteriores do usuário, grava um novo link e devolve o {@link OutgoingMail}
   * pronto para envio síncrono ({@code SYNC_ONCE}). Se a transação sofrer rollback (ex.: falha de
   * SMTP), o link novo é desfeito e os anteriores voltam a valer.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public OutgoingMail prepareResetMail(User target) {
    Instant now = clock.instant();
    resetTokens.invalidateOpenTokens(target.getId(), now);
    String raw = TokenService.newRawToken();
    resetTokens.save(
        new PasswordResetToken(
            target.getId(), TokenService.hash(raw), now.plus(LINK_VALIDITY), now));
    String link = properties.baseUrl() + "/reset-password?token=" + raw;
    return new OutgoingMail(
        MailKind.PASSWORD_RESET,
        target.getEmail(),
        PASSWORD_RESET_SUBJECT,
        MailTemplates.render("password-reset", Map.of("link", link)),
        target.getId());
  }

  /**
   * Invalida de forma atômica a senha atual, todas as sessões e tokens de renovação e os links
   * anteriores, emitindo um novo link de redefinição. Segue a ordem global de travas ({@code users}
   * já travado pelo chamador -> {@code refresh_tokens} -> {@code auth_sessions} -> {@code
   * password_reset_tokens}).
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public OutgoingMail forceReset(User target, String unmatchableHash) {
    tokens.revokeAllOfUser(target.getId(), RevokedBy.ADMIN);
    target.changePassword(unmatchableHash);
    return prepareResetMail(target);
  }
}
