package com.jvtech.gefinc.common.json;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.regex.Pattern;
import org.springframework.boot.jackson.JsonComponent;

/**
 * Dinheiro na API é sempre uma string decimal com 2 casas ("1234.56"), nunca um número JSON, para
 * não perder precisão no JavaScript (Princípio II). Todo {@link BigDecimal} do contrato é dinheiro.
 */
@JsonComponent
public class MoneyJson {

  private static final Pattern MONEY = Pattern.compile("^-?\\d+\\.\\d{2}$");

  public static class Serializer extends JsonSerializer<BigDecimal> {
    @Override
    public void serialize(BigDecimal value, JsonGenerator gen, SerializerProvider serializers)
        throws IOException {
      gen.writeString(value.setScale(2, java.math.RoundingMode.UNNECESSARY).toPlainString());
    }
  }

  public static class Deserializer extends JsonDeserializer<BigDecimal> {
    @Override
    public BigDecimal deserialize(JsonParser parser, DeserializationContext context)
        throws IOException {
      if (parser.currentToken() != JsonToken.VALUE_STRING) {
        throw new MoneyFormatException(
            "O valor monetário deve ser uma string decimal, ex.: \"10.00\"");
      }
      String text = parser.getText();
      if (!MONEY.matcher(text).matches()) {
        throw new MoneyFormatException(
            "Valor monetário inválido: use exatamente 2 casas decimais, ex.: \"10.00\"");
      }
      return new BigDecimal(text);
    }
  }
}
