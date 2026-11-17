package com.jvtech.gefinc.admin.email;

import java.util.List;

public record EmailDeliveryPageView(List<EmailDeliveryView> content, String nextCursor) {}
