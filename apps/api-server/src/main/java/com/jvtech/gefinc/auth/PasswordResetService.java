package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.common.config.AppProperties;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.mail.MailService;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Recuperação de senha por link de uso único enviado ao e-mail cadastrado. */
@Service
public class PasswordResetService {

  static final Duration LINK_VALIDITY = Duration.ofMinutes(60);

  private final UserRepository users;
  private final PasswordResetTokenRepository resetTokens;
  private final PasswordResetRateLimiter rateLimiter;
  private final PasswordPolicy policy;
  private final PasswordEncoder encoder;
  private final TokenService tokens;
  private final MailService mail;
  private final AppProperties properties;
  private final Clock clock;

  public PasswordResetService(
      UserRepository users,
      PasswordResetTokenRepository resetTokens,
      PasswordResetRateLimiter rateLimiter,
      PasswordPolicy policy,
      PasswordEncoder encoder,
      TokenService tokens,
      MailService mail,
      AppProperties properties,
      Clock clock) {
    this.users = users;
    this.resetTokens = resetTokens;
    this.rateLimiter = rateLimiter;
    this.policy = policy;
    this.encoder = encoder;
    this.tokens = tokens;
    this.mail = mail;
    this.properties = properties;
    this.clock = clock;
  }

  /**
   * Resposta sempre igual, exista a conta ou não. Para contas existentes, invalida os links
   * anteriores e envia um novo.
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
              mail.sendPasswordReset(
                  user.getEmail(), properties.baseUrl() + "/reset-password?token=" + raw);
            });
  }

  @Transactional
  public void confirm(String rawToken, String newPassword) {
    Instant now = clock.instant();
    PasswordResetToken token =
        resetTokens
            .findByTokenHash(TokenService.hash(rawToken))
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
    User user = users.findById(token.getUserId()).orElseThrow();
    user.changePassword(encoder.encode(newPassword));
    token.markUsed(now);
    resetTokens.invalidateOpenTokens(user.getId(), now);
    tokens.revokeAllOfUser(user.getId());
  }
}
