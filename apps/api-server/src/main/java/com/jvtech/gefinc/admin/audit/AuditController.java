package com.jvtech.gefinc.admin.audit;

import com.jvtech.gefinc.admin.common.AdminOnly;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Superfície exclusivamente de leitura da trilha de auditoria ({@code GET /admin/audit} e {@code
 * GET /admin/audit/{auditId}}). Não existe escrita, exclusão nem exportação.
 */
@RestController
@RequestMapping(value = "/admin/audit", produces = MediaType.APPLICATION_JSON_VALUE)
@AdminOnly
public class AuditController {

  private final AuditQueryService query;

  public AuditController(AuditQueryService query) {
    this.query = query;
  }

  /** Lista paginada por cursor opaco, da mais recente à mais antiga. */
  @GetMapping
  public AuditPageView list(
      @RequestParam(name = "from", required = false) String from,
      @RequestParam(name = "to", required = false) String to,
      @RequestParam(name = "actorId", required = false) Long actorId,
      @RequestParam(name = "targetUserId", required = false) Long targetUserId,
      @RequestParam(name = "action", required = false) String action,
      @RequestParam(name = "result", required = false) String result,
      @RequestParam(name = "cursor", required = false) String cursor,
      @RequestParam(name = "limit", required = false) Integer limit) {
    return query.list(from, to, actorId, targetUserId, action, result, cursor, limit);
  }

  /** Detalhe de um registro da trilha. */
  @GetMapping("/{auditId}")
  public AuditEntryView detail(@PathVariable("auditId") long auditId) {
    return query.detail(auditId);
  }
}
