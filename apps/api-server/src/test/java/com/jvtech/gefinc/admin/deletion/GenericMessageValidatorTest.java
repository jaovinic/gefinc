package com.jvtech.gefinc.admin.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jvtech.gefinc.common.error.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Validador heurístico de mensagens genéricas dos motivos de exclusão (T146): recusa e-mail,
 * sequências de 8 ou mais dígitos, marcadores de substituição e URLs, garantindo que nenhum dado
 * pessoal ou formatação indevida seja enviada.
 */
class GenericMessageValidatorTest {

  private GenericMessageValidator validator;

  @BeforeEach
  void setUp() {
    validator = new GenericMessageValidator();
  }

  @Test
  void aceitaMensagemGenericaEmPortugues() {
    String msg = "A exclusão desta conta foi realizada a pedido do titular dos dados.";
    validator.validate(msg);
    assertThat(validator.isValid(msg)).isTrue();
  }

  @Test
  void recusaMensagemEmBrancoOuNula() {
    assertThatThrownBy(() -> validator.validate(null)).isInstanceOf(ApiException.class);
    assertThatThrownBy(() -> validator.validate("   ")).isInstanceOf(ApiException.class);
    assertThat(validator.isValid("")).isFalse();
  }

  @Test
  void recusaMensagemAcimaDe500Caracteres() {
    String longo = "a".repeat(501);
    assertThatThrownBy(() -> validator.validate(longo)).isInstanceOf(ApiException.class);
    assertThat(validator.isValid(longo)).isFalse();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "Contato: suporte@gefinc.app para mais detalhes.",
        "Favor escrever para usuario.teste+12@dominio.com.br imediatamente.",
        "alvo@example.com foi excluído."
      })
  void recusaEmail(String mensagemComEmail) {
    assertThatThrownBy(() -> validator.validate(mensagemComEmail)).isInstanceOf(ApiException.class);
    assertThat(validator.isValid(mensagemComEmail)).isFalse();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "Processo número 12345678 em andamento.",
        "Telefone de contato 11999998888.",
        "Documento 12345678901 registrado."
      })
  void recusaSequenciaDeOitoOuMaisDigitos(String mensagemComDigitos) {
    assertThatThrownBy(() -> validator.validate(mensagemComDigitos))
        .isInstanceOf(ApiException.class);
    assertThat(validator.isValid(mensagemComDigitos)).isFalse();
  }

  @Test
  void aceitaMenosDeOitoDigitos() {
    String msg = "Prazo de 30 dias conforme artigo 123 da lei 456.";
    validator.validate(msg);
    assertThat(validator.isValid(msg)).isTrue();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "Olá {{nome}}, sua conta foi excluída.",
        "Usuário ${user_id} cancelado.",
        "Prezado {nome}, procedimento concluído.",
        "Conta do cliente %s excluída por determinação legal."
      })
  void recusaMarcadoresDeSubstituicao(String mensagemComTemplate) {
    assertThatThrownBy(() -> validator.validate(mensagemComTemplate))
        .isInstanceOf(ApiException.class);
    assertThat(validator.isValid(mensagemComTemplate)).isFalse();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "Acesse https://gefinc.app/ajuda para saber mais.",
        "Veja em http://suporte.exemplo.com os termos.",
        "Consulte www.exemplo.com.br/termos para orientações."
      })
  void recusaUrl(String mensagemComUrl) {
    assertThatThrownBy(() -> validator.validate(mensagemComUrl)).isInstanceOf(ApiException.class);
    assertThat(validator.isValid(mensagemComUrl)).isFalse();
  }
}
