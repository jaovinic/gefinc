package com.jvtech.gefinc.admin.common;

import com.jvtech.gefinc.auth.TokenService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Implementação provisória: ainda não existe identificador de sessão (claim {@code sid}), então
 * corta todos os acessos do administrador, o que é um superconjunto seguro da "sessão atual":
 * incrementa a versão do token (os tokens de acesso emitidos passam a dar 401) e revoga as famílias
 * de tokens de renovação. Transação própria, porque quem chama roda dentro da transação da ação,
 * que sofre rollback na recusa. As tarefas de sessões (T081/T082) trocam esta classe pela revogação
 * por {@code sid}.
 */
@Component
public class TokenVersionSessionRevoker implements CurrentSessionRevoker {

  private final JdbcTemplate jdbc;
  private final TokenService tokens;

  public TokenVersionSessionRevoker(JdbcTemplate jdbc, TokenService tokens) {
    this.jdbc = jdbc;
    this.tokens = tokens;
  }

  @Override
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void revokeCurrent(long adminId) {
    jdbc.update("UPDATE users SET token_version = token_version + 1 WHERE id = ?", adminId);
    tokens.revokeAllOfUser(adminId);
  }
}
