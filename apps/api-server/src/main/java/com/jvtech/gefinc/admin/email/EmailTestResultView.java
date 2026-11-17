package com.jvtech.gefinc.admin.email;

import com.jvtech.gefinc.common.mail.MailFailureReason;

/** Resultado do e-mail de teste: só o estado e a causa categorizada, sem mensagem técnica. */
public record EmailTestResultView(String status, MailFailureReason failureReason) {}
