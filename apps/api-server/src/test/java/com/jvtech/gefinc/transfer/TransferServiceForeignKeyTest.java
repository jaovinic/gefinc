package com.jvtech.gefinc.transfer;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import org.hibernate.exception.ConstraintViolationException;
import org.hibernate.exception.ConstraintViolationException.ConstraintKind;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * Só a violação das chaves estrangeiras de conta vira 404; qualquer outra violação de integridade
 * não pode ser mascarada como "Conta não encontrada.".
 */
class TransferServiceForeignKeyTest {

  private static DataIntegrityViolationException violation(
      String sqlState, String constraint, String message) {
    SQLException sql = new SQLException(message, sqlState);
    return new DataIntegrityViolationException(
        "could not execute statement",
        new ConstraintViolationException(
            "could not execute statement", sql, "insert", ConstraintKind.OTHER, constraint));
  }

  @Test
  void chavesEstrangeirasDeContaSaoReconhecidas() {
    for (String fk : new String[] {"fk_at_from", "fk_at_to"}) {
      assertThat(
              TransferService.isAccountForeignKeyViolation(
                  violation("23503", fk, "violates foreign key constraint \"" + fk + "\"")))
          .isTrue();
    }
  }

  @Test
  void chaveEstrangeiraDeContaSemNomeNoObjetoMasNaMensagemTambemE() {
    DataIntegrityViolationException e =
        new DataIntegrityViolationException(
            "x",
            new SQLException(
                "ERROR: insert violates foreign key constraint \"fk_at_to\"", "23503"));
    assertThat(TransferService.isAccountForeignKeyViolation(e)).isTrue();
  }

  @Test
  void outrasViolacoesNaoSaoTratadasComoContaInexistente() {
    assertThat(
            TransferService.isAccountForeignKeyViolation(
                violation("23514", "ck_at_amount", "violates check constraint \"ck_at_amount\"")))
        .isFalse();
    assertThat(
            TransferService.isAccountForeignKeyViolation(
                violation("23505", "uq_at_id_user", "violates unique constraint")))
        .isFalse();
    assertThat(
            TransferService.isAccountForeignKeyViolation(
                violation(
                    "23503", "account_transfers_user_id_fkey", "violates foreign key (users)")))
        .isFalse();
    assertThat(TransferService.isAccountForeignKeyViolation(new DataIntegrityViolationException("x")))
        .isFalse();
  }
}
