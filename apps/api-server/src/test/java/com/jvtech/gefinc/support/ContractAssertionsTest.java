package com.jvtech.gefinc.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.atlassian.oai.validator.model.SimpleRequest;
import com.atlassian.oai.validator.model.SimpleResponse;
import com.atlassian.oai.validator.report.ValidationReport;
import org.junit.jupiter.api.Test;

class ContractAssertionsTest {

  @Test
  void carregaOContratoOpenApi31EValidaUmaInteracaoCorreta() {
    var request =
        SimpleRequest.Builder.post("/auth/login")
            .withContentType("application/json")
            .withBody("{\"email\":\"ana@example.com\",\"password\":\"senha-forte-123\"}")
            .build();
    var response =
        SimpleResponse.Builder.status(200)
            .withContentType("application/json")
            .withBody("{\"accessToken\":\"abc\",\"expiresIn\":900}")
            .build();

    ValidationReport report = ContractAssertions.validator().validate(request, response);

    assertThat(report.hasErrors()).as(report.toString()).isFalse();
  }

  @Test
  void detectaRespostaForaDoContrato() {
    var request =
        SimpleRequest.Builder.post("/auth/login")
            .withContentType("application/json")
            .withBody("{\"email\":\"ana@example.com\",\"password\":\"senha-forte-123\"}")
            .build();
    var response =
        SimpleResponse.Builder.status(200)
            .withContentType("application/json")
            .withBody("{\"expiresIn\":\"nao-e-numero\"}")
            .build();

    ValidationReport report = ContractAssertions.validator().validate(request, response);

    assertThat(report.hasErrors()).isTrue();
  }
}
