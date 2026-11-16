package com.jvtech.gefinc.admin.audit;

import java.util.List;

public record AuditPageView(List<AuditEntryView> content, String nextCursor) {}
