package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.security.JwtService;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
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
  private final String dummyHash;

  public AuthService(
      UserRepository users,
      PasswordEncoder encoder,
      JwtService jwt,
      TokenService tokens,
      Clock clock) {
    this.users = users;
    this.encoder = encoder;
    this.jwt = jwt;
    this.tokens = tokens;
    this.clock = clock;
    // Comparação "de fachada" quando o e-mail não existe, para o tempo de resposta não revelá-lo.
    this.dummyHash = encoder.encode("senha-de-fachada-para-igualar-o-tempo");
  }

  @Transactional
  public Session login(String email, String password) {
    User user = users.findByEmail(email.strip()).orElse(null);
    boolean matches = matches(password, user == null ? dummyHash : user.getPasswordHash());
    if (user == null || !matches) {
      throw invalidCredentials();
    }
    if (user.isDeletionPending()) {
      throw deletionPending(user);
    }
    return new Session(
        jwt.issueAccessToken(user.getId(), user.getTokenVersion()),
        jwt.accessTokenTtlSeconds(),
        tokens.issueNewFamily(user.getId()));
  }

  /** Troca o token de renovação por um novo par; vazio se o token não vale mais. */
  @Transactional
  public Optional<Session> refresh(String rawRefreshToken) {
    return tokens
        .rotate(rawRefreshToken)
        .flatMap(
            rotation -> {
              Optional<User> user = users.findById(rotation.userId());
              if (user.isEmpty() || user.get().isDeletionPending()) {
                tokens.revokeAllOfUser(rotation.userId());
                return Optional.empty();
              }
              return Optional.of(
                  new Session(
                      jwt.issueAccessToken(user.get().getId(), user.get().getTokenVersion()),
                      jwt.accessTokenTtlSeconds(),
                      rotation.newRawToken()));
            });
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
    return LocalDate.ofInstant(
        user.getDeletionRequestedAt().plus(java.time.Duration.ofDays(DELETION_GRACE_DAYS)),
        clock.getZone());
  }

  public static ApiException invalidCredentials() {
    return new ApiException(ErrorCode.INVALID_CREDENTIALS, "E-mail ou senha incorretos.");
  }

  private ApiException deletionPending(User user) {
    return new ApiException(
            ErrorCode.ACCOUNT_DELETION_PENDING,
            "A exclusão desta conta está agendada. Entre com suas credenciais para cancelá-la.")
        .with("deletionDate", deletionDate(user));
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
