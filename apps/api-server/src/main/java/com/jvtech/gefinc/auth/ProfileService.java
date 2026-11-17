package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.admin.deletion.UserNoticeService;
import com.jvtech.gefinc.auth.AuthDtos.UserNoticeDto;
import com.jvtech.gefinc.auth.AuthDtos.UserProfile;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.security.JwtService;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import java.util.List;
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
  private final UserNoticeService userNoticeService;

  public ProfileService(
      UserRepository users,
      AuthService auth,
      PasswordPolicy policy,
      PasswordEncoder encoder,
      JwtService jwt,
      TokenService tokens,
      UserNoticeService userNoticeService) {
    this.users = users;
    this.auth = auth;
    this.policy = policy;
    this.encoder = encoder;
    this.jwt = jwt;
    this.tokens = tokens;
    this.userNoticeService = userNoticeService;
  }

  static UserProfile toProfile(User user) {
    return toProfile(user, null);
  }

  static UserProfile toProfile(User user, List<UserNoticeDto> notices) {
    return new UserProfile(
        user.getId(),
        user.getEmail(),
        user.getName(),
        user.getCreatedAt(),
        user.getRole().isAdmin(),
        notices != null && !notices.isEmpty() ? notices : null);
  }

  @Transactional
  public UserProfile get(long userId) {
    User user = load(userId);
    List<UserNoticeDto> notices = userNoticeService.deliverNotices(user);
    return toProfile(user, notices);
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
    // Usuário travado antes de tocar nos tokens (ordem global de travas), já com o estado vigente.
    User user =
        users
            .findForUpdate(userId)
            .orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED, "Sessão expirada."));
    if (user.isSuspended() || user.isDeletionPending()) {
      // Suspensa ou excluída enquanto esperava: a sessão já não vale, como no filtro de acesso.
      throw new ApiException(ErrorCode.UNAUTHORIZED, "Sessão expirada.");
    }
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
    tokens.revokeAllOfUser(userId, RevokedBy.USER);
    TokenService.Issued issued = tokens.issueNewFamily(userId);
    return new AuthService.Session(
        jwt.issueAccessToken(user.getId(), user.getTokenVersion(), issued.familyId()),
        jwt.accessTokenTtlSeconds(),
        issued.rawToken());
  }

  private User load(long userId) {
    return users
        .findById(userId)
        .orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED, "Sessão expirada."));
  }
}
