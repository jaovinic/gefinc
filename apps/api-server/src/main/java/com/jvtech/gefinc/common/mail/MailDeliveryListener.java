package com.jvtech.gefinc.common.mail;

/**
 * Ouve o resultado final de cada envio (por exemplo, para o histórico de envios). Exceções do
 * ouvinte são contidas pelo {@link MailService} e não alteram o resultado nem derrubam o envio.
 */
public interface MailDeliveryListener {

  void onDelivery(OutgoingMail mail, MailOutcome outcome);
}
