package com.jvtech.gefinc.admin.common;

import com.jvtech.gefinc.auth.LoginAttemptLimiter;
import com.jvtech.gefinc.common.config.AppProperties;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.ratelimit.PerKeyRateLimiter;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.common.security.RequestOrigin;
import com.jvtech.gefinc.common.security.RequestOriginProvider;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Pede a senha do próprio administrador antes das ações sensíveis. Recusa com 403 {@code
 * REAUTH_FAILED} (nunca 401: o cliente trata 401 como sessão expirada e tentaria renovar o token).
 * Conta as falhas no mesmo limitador do login (por e-mail e por IP), então a rota não serve para
 * força bruta, e na quinta falha consecutiva revoga o acesso do administrador. Sucesso zera só o
 * contador de reautenticação, não o do login.
 */
@Component
public class Reauthenticator {

  private record Credentials(String email, String passwordHash) {}

  private static final String UNKNOWN_IP = "unknown";

  private final JdbcTemplate jdbc;
  private final PasswordEncoder encoder;
  private final LoginAttemptLimiter loginLimiter;
  private final PerKeyRateLimiter reauthFailures;
  private final CurrentSessionRevoker revoker;
  private final RequestOriginProvider origins;
  private final int maxFailures;

  public Reauthenticator(
      JdbcTemplate jdbc,
      PasswordEncoder encoder,
      LoginAttemptLimiter loginLimiter,
      @Qualifier("adminReauthFailureLimiter") PerKeyRateLimiter reauthFailures,
      CurrentSessionRevoker revoker,
      RequestOriginProvider origins,
      AppProperties properties) {
    this.jdbc = jdbc;
    this.encoder = encoder;
    this.loginLimiter = loginLimiter;
    this.reauthFailures = reauthFailures;
    this.revoker = revoker;
    this.origins = origins;
    this.maxFailures = properties.admin().reauthMaxFailures();
  }

  /** Confere a senha do administrador autenticado ({@link CurrentUser}). */
  public void verify(String password) {
    long adminId = CurrentUser.id();
    // Projeção direta: não carrega a entidade, para o Hibernate não sobrescrever o token_version
    // incrementado pela revogação.
    List<Credentials> found =
        jdbc.query(
            "SELECT email, password_hash FROM users WHERE id = ?",
            (rs, row) -> new Credentials(rs.getString(1), rs.getString(2)),
            adminId);
    if (found.isEmpty()) {
      throw new ApiException(ErrorCode.REAUTH_FAILED, "Senha incorreta.");
    }
    Credentials credentials = found.get(0);
    RequestOrigin origin = origins.current();
    String ip = origin.known() ? origin.ip() : UNKNOWN_IP;
    String key = Long.toString(adminId);

    loginLimiter.checkAllowed(credentials.email(), ip);
    if (password == null || !encoder.matches(password, credentials.passwordHash())) {
      loginLimiter.recordFailure(credentials.email(), ip);
      reauthFailures.record(key);
      if (reauthFailures.count(key) >= maxFailures) {
        revoker.revokeCurrent(adminId);
        reauthFailures.reset(key);
      }
      throw new ApiException(ErrorCode.REAUTH_FAILED, "Senha incorreta.");
    }
    reauthFailures.reset(key);
  }
}
