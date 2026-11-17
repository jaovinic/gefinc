package com.jvtech.gefinc.admin.email;

import com.jvtech.gefinc.admin.audit.PartyView;
import com.jvtech.gefinc.common.mail.MailFailureReason;
import com.jvtech.gefinc.common.mail.MailKind;
import java.time.Instant;

/** Linha do histórico de envios; sem corpo, assunto, link, token nem código. */
public record EmailDeliveryView(
    long id,
    Instant createdAt,
    MailKind kind,
    PartyView recipient,
    String status,
    MailFailureReason failureReason) {}
