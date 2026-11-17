package com.jvtech.gefinc.admin.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Matriz completa da máquina de estados do livro-razão de exclusão (T133): SCHEDULED, CANCELED,
 * SUPERSEDED, EXECUTED; só antecipar; transições inválidas.
 */
class DeletionPolicyTest {

  private static final Instant NOW = Instant.parse("2026-11-17T12:00:00Z");
  private static final Instant DUE = NOW.plus(Duration.ofDays(30));

  private AccountDeletionRequest request;

  @BeforeEach
  void setUp() {
    request = AccountDeletionRequest.forUser(100L, "ref-100", NOW, DUE);
  }

  @Nested
  @DisplayName("Transições válidas")
  class ValidTransitions {

    @Test
    void scheduledParaCanceled() {
      assertThat(request.isScheduled()).isTrue();
      request.cancel(NOW.plusSeconds(60), 200L);

      assertThat(request.isCanceled()).isTrue();
      assertThat(request.getStatus()).isEqualTo(AccountDeletionRequest.STATUS_CANCELED);
      assertThat(request.getCanceledAt()).isEqualTo(NOW.plusSeconds(60));
      assertThat(request.getCanceledBy()).isEqualTo(200L);
    }

    @Test
    void scheduledParaSuperseded() {
      request.supersede();

      assertThat(request.isSuperseded()).isTrue();
      assertThat(request.getStatus()).isEqualTo(AccountDeletionRequest.STATUS_SUPERSEDED);
    }

    @Test
    void supersededParaScheduledNaReversaoDeAntecipacao() {
      request.supersede();
      assertThat(request.isSuperseded()).isTrue();

      request.restoreFromSuperseded();
      assertThat(request.isScheduled()).isTrue();
      assertThat(request.getStatus()).isEqualTo(AccountDeletionRequest.STATUS_SCHEDULED);
    }

    @Test
    void scheduledParaExecuted() {
      request.execute(DUE);

      assertThat(request.isExecuted()).isTrue();
      assertThat(request.getStatus()).isEqualTo(AccountDeletionRequest.STATUS_EXECUTED);
      assertThat(request.getExecutedAt()).isEqualTo(DUE);
    }
  }

  @Nested
  @DisplayName("Transições inválidas e estados terminais")
  class InvalidTransitions {

    @Test
    void tentarCancelarExclusaoJaExecutadaLancaDeletionAlreadyExecuted() {
      request.execute(DUE);

      assertThatThrownBy(() -> request.cancel(NOW.plus(Duration.ofDays(31)), 200L))
          .isInstanceOf(ApiException.class)
          .satisfies(
              e ->
                  assertThat(((ApiException) e).code())
                      .isEqualTo(ErrorCode.DELETION_ALREADY_EXECUTED));
    }

    @Test
    void tentarCancelarExclusaoJaCanceladaLancaIllegalStateException() {
      request.cancel(NOW.plusSeconds(10), 200L);

      assertThatThrownBy(() -> request.cancel(NOW.plusSeconds(20), 200L))
          .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void tentarCancelarExclusaoSubstituidaLancaIllegalStateException() {
      request.supersede();

      assertThatThrownBy(() -> request.cancel(NOW.plusSeconds(10), 200L))
          .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void tentarSubstituirExclusaoJaExecutadaLancaDeletionAlreadyExecuted() {
      request.execute(DUE);

      assertThatThrownBy(() -> request.supersede())
          .isInstanceOf(ApiException.class)
          .satisfies(
              e ->
                  assertThat(((ApiException) e).code())
                      .isEqualTo(ErrorCode.DELETION_ALREADY_EXECUTED));
    }

    @Test
    void tentarSubstituirExclusaoJaCanceladaLancaIllegalStateException() {
      request.cancel(NOW.plusSeconds(10), 200L);

      assertThatThrownBy(() -> request.supersede()).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void tentarExecutarExclusaoJaCanceladaLancaIllegalStateException() {
      request.cancel(NOW.plusSeconds(10), 200L);

      assertThatThrownBy(() -> request.execute(DUE)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void tentarExecutarExclusaoSubstituidaLancaIllegalStateException() {
      request.supersede();

      assertThatThrownBy(() -> request.execute(DUE)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void tentarRestaurarExclusaoNaoSubstituidaLancaIllegalStateException() {
      assertThatThrownBy(() -> request.restoreFromSuperseded())
          .isInstanceOf(IllegalStateException.class);

      request.cancel(NOW.plusSeconds(10), 200L);
      assertThatThrownBy(() -> request.restoreFromSuperseded())
          .isInstanceOf(IllegalStateException.class);
    }
  }

  @Nested
  @DisplayName("Regras de antecipação")
  class AnticipationRules {

    @Test
    void aceitaPrazoEstritamenteAnteriorAoAtual() {
      Instant novoPrazo = DUE.minus(Duration.ofDays(5));
      request.requireEarlierThan(novoPrazo); // não deve lançar exceção
    }

    @Test
    void recusaPrazoIgualAoAtual() {
      assertThatThrownBy(() -> request.requireEarlierThan(DUE))
          .isInstanceOf(ApiException.class)
          .satisfies(
              e -> assertThat(((ApiException) e).code()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }

    @Test
    void recusaPrazoPosteriorAoAtual() {
      Instant posterior = DUE.plus(Duration.ofDays(1));
      assertThatThrownBy(() -> request.requireEarlierThan(posterior))
          .isInstanceOf(ApiException.class)
          .satisfies(
              e -> assertThat(((ApiException) e).code()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }
  }
}
