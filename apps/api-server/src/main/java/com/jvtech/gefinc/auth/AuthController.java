package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.auth.AuthDtos.AccountDeletionRequest;
import com.jvtech.gefinc.auth.AuthDtos.ChangePasswordRequest;
import com.jvtech.gefinc.auth.AuthDtos.DeletionScheduled;
import com.jvtech.gefinc.auth.AuthDtos.LoginRequest;
import com.jvtech.gefinc.auth.AuthDtos.PasswordResetConfirm;
import com.jvtech.gefinc.auth.AuthDtos.PasswordResetRequest;
import com.jvtech.gefinc.auth.AuthDtos.RefreshRequest;
import com.jvtech.gefinc.auth.AuthDtos.RegisterRequest;
import com.jvtech.gefinc.auth.AuthDtos.TokenResponse;
import com.jvtech.gefinc.auth.AuthDtos.UpdateProfileRequest;
import com.jvtech.gefinc.auth.AuthDtos.UserProfile;
import com.jvtech.gefinc.common.config.AppProperties;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.common.security.CurrentUser;
import com.jvtech.gefinc.user.User;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.Arrays;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoints de autenticação. O cliente web (cabeçalho {@code X-Client: web}) recebe o refresh token
 * em cookie HttpOnly e o devolve pelo cookie; o mobile usa o corpo das mensagens.
 */
@RestController
@RequestMapping("/auth")
public class AuthController {

  static final String REFRESH_COOKIE = "gefinc_refresh";
  private static final String CLIENT_HEADER = "X-Client";

  private final RegistrationService registration;
  private final AuthService auth;
  private final PasswordResetService passwordReset;
  private final AccountDeletionService deletion;
  private final ProfileService profile;
  private final AppProperties properties;

  public AuthController(
      RegistrationService registration,
      AuthService auth,
      PasswordResetService passwordReset,
      AccountDeletionService deletion,
      ProfileService profile,
      AppProperties properties) {
    this.registration = registration;
    this.auth = auth;
    this.passwordReset = passwordReset;
    this.deletion = deletion;
    this.profile = profile;
    this.properties = properties;
  }

  @PostMapping("/register")
  @ResponseStatus(HttpStatus.CREATED)
  public UserProfile register(@Valid @RequestBody RegisterRequest body) {
    User user = registration.register(body.email(), body.password());
    return ProfileService.toProfile(user);
  }

  @PostMapping("/login")
  public TokenResponse login(
      @Valid @RequestBody LoginRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    return respond(
        auth.login(body.email(), body.password(), request.getRemoteAddr()), request, response);
  }

  @PostMapping("/refresh")
  public TokenResponse refresh(
      @RequestBody(required = false) RefreshRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    String raw = presentedRefreshToken(body, request);
    return auth.refresh(raw == null ? "" : raw)
        .filter(session -> raw != null)
        .map(session -> respond(session, request, response))
        .orElseThrow(
            () -> new ApiException(ErrorCode.UNAUTHORIZED, "Sessão expirada. Entre novamente."));
  }

  @PostMapping("/logout")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void logout(
      @RequestBody(required = false) RefreshRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    CurrentUser.id();
    auth.logout(presentedRefreshToken(body, request));
    if (isWeb(request)) {
      addRefreshCookie(request, response, "", Duration.ZERO);
    }
  }

  @PostMapping("/password-reset/request")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public void requestPasswordReset(@Valid @RequestBody PasswordResetRequest body) {
    passwordReset.request(body.email());
  }

  @PostMapping("/password-reset/confirm")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void confirmPasswordReset(@Valid @RequestBody PasswordResetConfirm body) {
    passwordReset.confirm(body.token(), body.newPassword());
  }

  @GetMapping("/me")
  public UserProfile me() {
    return profile.get(CurrentUser.id());
  }

  @PatchMapping("/me")
  public UserProfile updateMe(@Valid @RequestBody UpdateProfileRequest body) {
    return profile.rename(CurrentUser.id(), body.name());
  }

  /** Troca a senha e devolve uma sessão nova: as anteriores (inclusive esta) deixam de valer. */
  @PostMapping("/password")
  public TokenResponse changePassword(
      @Valid @RequestBody ChangePasswordRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    return respond(
        profile.changePassword(CurrentUser.id(), body.currentPassword(), body.newPassword()),
        request,
        response);
  }

  @PostMapping("/account-deletion")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public DeletionScheduled requestAccountDeletion(@Valid @RequestBody AccountDeletionRequest body) {
    return new DeletionScheduled(deletion.request(CurrentUser.id(), body.password()));
  }

  @PostMapping("/account-deletion/cancel")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void cancelAccountDeletion(
      @Valid @RequestBody LoginRequest body, HttpServletRequest request) {
    deletion.cancel(body.email(), body.password(), request.getRemoteAddr());
  }

  private TokenResponse respond(
      AuthService.Session session, HttpServletRequest request, HttpServletResponse response) {
    if (isWeb(request)) {
      addRefreshCookie(
          request, response, session.refreshToken(), properties.security().refreshTokenTtl());
      return new TokenResponse(session.accessToken(), session.expiresIn(), null);
    }
    return new TokenResponse(session.accessToken(), session.expiresIn(), session.refreshToken());
  }

  /**
   * Web: só o cookie (com o cabeçalho de cliente, contra requisições forjadas). Mobile: só o corpo.
   */
  private String presentedRefreshToken(RefreshRequest body, HttpServletRequest request) {
    if (isWeb(request)) {
      Cookie[] cookies = request.getCookies();
      return cookies == null
          ? null
          : Arrays.stream(cookies)
              .filter(c -> REFRESH_COOKIE.equals(c.getName()))
              .map(Cookie::getValue)
              .findFirst()
              .orElse(null);
    }
    return body == null ? null : body.refreshToken();
  }

  private static boolean isWeb(HttpServletRequest request) {
    return "web".equalsIgnoreCase(request.getHeader(CLIENT_HEADER));
  }

  private void addRefreshCookie(
      HttpServletRequest request, HttpServletResponse response, String value, Duration maxAge) {
    ResponseCookie cookie =
        ResponseCookie.from(REFRESH_COOKIE, value)
            .httpOnly(true)
            .secure(true)
            .sameSite("Strict")
            .path(request.getContextPath() + "/auth")
            .maxAge(maxAge)
            .build();
    response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
  }
}
