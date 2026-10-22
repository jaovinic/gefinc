package com.jvtech.gefinc.account;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Catálogo de ícones identificadores de conta e cartão; as chaves são as do contrato OpenAPI. */
public enum AccountIcon {
  BANK("bank"),
  BUILDING("building"),
  BRIEFCASE("briefcase"),
  LANDMARK("landmark"),
  WALLET("wallet"),
  CASH("cash"),
  PIGGY("piggy"),
  CARD("card"),
  CARD_GOLD("card-gold"),
  CARD_PLATINUM("card-platinum"),
  CARD_BLACK("card-black"),
  SHIELD("shield"),
  ROCKET("rocket"),
  STAR("star"),
  GLOBE("globe"),
  SHOPPING_BAG("shopping-bag");

  private final String key;

  AccountIcon(String key) {
    this.key = key;
  }

  @JsonValue
  public String key() {
    return key;
  }

  @JsonCreator
  public static AccountIcon fromKey(String key) {
    for (AccountIcon icon : values()) {
      if (icon.key.equals(key)) {
        return icon;
      }
    }
    throw new IllegalArgumentException("Ícone desconhecido: " + key);
  }

  /**
   * Ícone mostrado quando a conta não escolheu um: o mesmo que o cliente usa para cópias antigas.
   */
  public static AccountIcon defaultFor(AccountType type, HolderType holderType) {
    return switch (type) {
      case CASH -> CASH;
      case CREDIT_CARD -> CARD;
      case CHECKING -> holderType == HolderType.PJ ? BUILDING : BANK;
    };
  }
}
