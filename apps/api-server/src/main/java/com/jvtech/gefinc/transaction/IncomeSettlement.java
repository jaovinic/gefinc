package com.jvtech.gefinc.transaction;

import java.time.Clock;
import java.time.LocalDate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Liquidação de receitas: receita fora de cartão com vencimento hoje ou anterior entra na conta
 * (recebida, com a data de vencimento como data de recebimento). Roda de forma preguiçosa, antes de
 * toda leitura ou alteração de lançamentos, e é idempotente.
 */
@Component
public class IncomeSettlement {

  private final TransactionRepository transactions;
  private final Clock clock;

  IncomeSettlement(TransactionRepository transactions, Clock clock) {
    this.transactions = transactions;
    this.clock = clock;
  }

  /**
   * Liquida as receitas pendentes vencidas do usuário.
   *
   * @return quantas receitas passaram a recebidas
   */
  @Transactional
  public int settleDue(long userId) {
    return transactions.settleDueIncome(userId, LocalDate.now(clock));
  }
}
