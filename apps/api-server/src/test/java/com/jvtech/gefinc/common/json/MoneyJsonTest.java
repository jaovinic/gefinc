package com.jvtech.gefinc.common.json;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class MoneyJsonTest {

  record Amount(BigDecimal value) {}

  private final ObjectMapper mapper =
      new ObjectMapper()
          .registerModule(
              new SimpleModule()
                  .addSerializer(BigDecimal.class, new MoneyJson.Serializer())
                  .addDeserializer(BigDecimal.class, new MoneyJson.Deserializer()));

  @Test
  void serializaComoStringDecimalComDuasCasas() throws Exception {
    assertThat(mapper.writeValueAsString(new Amount(new BigDecimal("1234.5"))))
        .isEqualTo("{\"value\":\"1234.50\"}");
    assertThat(mapper.writeValueAsString(new Amount(new BigDecimal("-0.05"))))
        .isEqualTo("{\"value\":\"-0.05\"}");
  }

  @Test
  void desserializaStringDecimalExata() throws Exception {
    Amount amount = mapper.readValue("{\"value\":\"10.00\"}", Amount.class);
    assertThat(amount.value()).isEqualByComparingTo("10.00");
  }

  @Test
  void rejeitaNumeroJsonPoisPerdePrecisao() {
    assertThatThrownBy(() -> mapper.readValue("{\"value\":10.00}", Amount.class))
        .isInstanceOf(JsonMappingException.class)
        .hasRootCauseInstanceOf(MoneyFormatException.class);
  }

  @Test
  void rejeitaQuantidadeErradaDeCasasDecimais() {
    for (String invalid : new String[] {"10", "10.5", "10.555", "10,50", ""}) {
      assertThatThrownBy(() -> mapper.readValue("{\"value\":\"" + invalid + "\"}", Amount.class))
          .hasRootCauseInstanceOf(MoneyFormatException.class);
    }
  }
}
