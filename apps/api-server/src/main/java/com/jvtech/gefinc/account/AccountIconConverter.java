package com.jvtech.gefinc.account;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Grava o ícone pela chave do contrato (minúscula, com hífen), como o {@code CHECK} do banco. */
@Converter
public class AccountIconConverter implements AttributeConverter<AccountIcon, String> {

  @Override
  public String convertToDatabaseColumn(AccountIcon icon) {
    return icon == null ? null : icon.key();
  }

  @Override
  public AccountIcon convertToEntityAttribute(String key) {
    return key == null ? null : AccountIcon.fromKey(key);
  }
}
