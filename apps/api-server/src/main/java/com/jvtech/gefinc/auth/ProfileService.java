package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.auth.AuthDtos.UserProfile;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.security.JwtService;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Dados do próprio usuário: nome de exibição e troca de senha estando conectado. */
@Service
public class ProfileService {

  private final UserRepository users;
  private final AuthService auth;
  private final PasswordPolicy policy;
  private final PasswordEncoder encoder;
  private final JwtService jwt;
  private final TokenService tokens;

  public ProfileService(
      UserRepository users,
      AuthService auth,
      PasswordPolicy policy,
      PasswordEncoder encoder,
      JwtService jwt,
      TokenService tokens) {
    this.users = users;
    this.auth = auth;
    this.policy = policy;
    this.encoder = encoder;
    this.jwt = jwt;
    this.tokens = tokens;
  }

  static UserProfile toProfile(User user) {
    return new UserProfile(user.getId(), user.getEmail(), user.getName(), user.getCreatedAt());
  }

  @Transactional(readOnly = true)
  public UserProfile get(long userId) {
    return toProfile(load(userId));
  }

  @Transactional
  public UserProfile rename(long userId, String name) {
    User user = load(userId);
    user.rename(name);
    return toProfile(user);
  }

  /**
   * Exige a senha atual e aplica a política da nova. Encerra todas as sessões (os tokens antigos
   * deixam de valer) e abre uma nova para quem acabou de trocar, que continua conectado.
   */
  @Transactional
  public AuthService.Session changePassword(
      long userId, String currentPassword, String newPassword) {
    User user = load(userId);
    if (!auth.matches(currentPassword, user.getPasswordHash())) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("currentPassword", "A senha atual está incorreta.");
    }
    policy
        .violation(newPassword)
        .ifPresent(
            reason -> {
              throw ApiException.validation("Há campos inválidos.")
                  .withFieldError("newPassword", reason);
            });
    if (auth.matches(newPassword, user.getPasswordHash())) {
      throw ApiException.validation("Há campos inválidos.")
          .withFieldError("newPassword", "A nova senha deve ser diferente da atual.");
    }
    user.changePassword(encoder.encode(newPassword));
    tokens.revokeAllOfUser(userId);
    return new AuthService.Session(
        jwt.issueAccessToken(user.getId(), user.getTokenVersion()),
        jwt.accessTokenTtlSeconds(),
        tokens.issueNewFamily(userId));
  }

  private User load(long userId) {
    return users
        .findById(userId)
        .orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED, "Sessão expirada."));
  }
}
