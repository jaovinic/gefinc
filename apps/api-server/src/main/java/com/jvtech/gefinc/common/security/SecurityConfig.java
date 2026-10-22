package com.jvtech.gefinc.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jvtech.gefinc.common.config.AppProperties;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/** Autenticação stateless por JWT, CORS restrito e cabeçalhos de segurança (Princípio III). */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

  private static final int DEFAULT_BCRYPT_STRENGTH = 12;

  @Bean
  SecurityFilterChain securityFilterChain(
      HttpSecurity http, JwtService jwtService, TokenVersionLookup lookup, ObjectMapper mapper)
      throws Exception {
    ProblemSecurityHandlers handlers = new ProblemSecurityHandlers(mapper);
    http.csrf(AbstractHttpConfigurer::disable)
        .cors(Customizer.withDefaults())
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            auth ->
                auth.requestMatchers(
                        HttpMethod.POST,
                        "/auth/register",
                        "/auth/login",
                        "/auth/refresh",
                        "/auth/password-reset/request",
                        "/auth/password-reset/confirm",
                        "/auth/account-deletion/cancel")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/**")
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .exceptionHandling(e -> e.authenticationEntryPoint(handlers).accessDeniedHandler(handlers))
        .headers(
            h ->
                h.frameOptions(f -> f.deny())
                    .contentTypeOptions(Customizer.withDefaults())
                    .referrerPolicy(
                        r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                    .httpStrictTransportSecurity(Customizer.withDefaults()))
        .addFilterBefore(
            new JwtAuthenticationFilter(jwtService, lookup),
            UsernamePasswordAuthenticationFilter.class);
    return http.build();
  }

  @Bean
  CorsConfigurationSource corsConfigurationSource(AppProperties properties) {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(properties.security().corsOrigins());
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Client", "X-Request-Id"));
    config.setExposedHeaders(List.of("X-Request-Id", "Retry-After"));
    config.setAllowCredentials(true);
    config.setMaxAge(3600L);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return source;
  }

  @Bean
  PasswordEncoder passwordEncoder(AppProperties properties) {
    Integer strength = properties.security().bcryptStrength();
    return new BCryptPasswordEncoder(strength == null ? DEFAULT_BCRYPT_STRENGTH : strength);
  }
}
