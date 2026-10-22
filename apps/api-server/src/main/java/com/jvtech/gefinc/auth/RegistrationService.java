package com.jvtech.gefinc.auth;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRegisteredEvent;
import com.jvtech.gefinc.user.UserRepository;
import java.time.Clock;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RegistrationService {

  private final UserRepository users;
  private final PasswordEncoder encoder;
  private final PasswordPolicy policy;
  private final ApplicationEventPublisher events;
  private final Clock clock;

  public RegistrationService(
      UserRepository users,
      PasswordEncoder encoder,
      PasswordPolicy policy,
      ApplicationEventPublisher events,
      Clock clock) {
    this.users = users;
    this.encoder = encoder;
    this.policy = policy;
    this.events = events;
    this.clock = clock;
  }

  @Transactional
  public User register(String email, String password) {
    policy
        .violation(password)
        .ifPresent(
            reason -> {
              throw ApiException.validation(reason);
            });
    String normalized = email.strip();
    if (users.existsByEmail(normalized)) {
      throw emailTaken();
    }
    try {
      User user =
          users.saveAndFlush(new User(normalized, encoder.encode(password), clock.instant()));
      events.publishEvent(new UserRegisteredEvent(user.getId()));
      return user;
    } catch (DataIntegrityViolationException e) {
      throw emailTaken();
    }
  }

  private static ApiException emailTaken() {
    return new ApiException(ErrorCode.EMAIL_ALREADY_REGISTERED, "Este e-mail já está cadastrado.");
  }
}
