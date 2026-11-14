package com.jvtech.gefinc.admin.common;

import com.jvtech.gefinc.admin.audit.AuditAction;
import com.jvtech.gefinc.admin.audit.AuditDetails;
import com.jvtech.gefinc.admin.common.AdminActionExecutor.AuditContext;
import java.util.Map;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoints só de teste sob {@code /admin/_test}: permitem exercitar reautenticação e limites de
 * taxa antes de existirem os controladores reais do painel. Como todo controlador sob {@code
 * /admin}, é exclusivo de administradores ({@link AdminOnly}).
 */
@TestConfiguration
public class AdminTestEndpoints {

  @RestController
  @RequestMapping("/admin/_test")
  @AdminOnly
  public static class TestController {

    private final AdminActionExecutor executor;
    private final Reauthenticator reauthenticator;

    TestController(AdminActionExecutor executor, Reauthenticator reauthenticator) {
      this.executor = executor;
      this.reauthenticator = reauthenticator;
    }

    @GetMapping("/read")
    public Map<String, String> read() {
      return Map.of("ok", "read");
    }

    @PostMapping("/mutate")
    public Map<String, String> mutate() {
      return Map.of("ok", "mutate");
    }

    @Destructive
    @PostMapping("/destroy")
    public Map<String, String> destroy() {
      return Map.of("ok", "destroy");
    }

    @PostMapping("/reauth")
    public Map<String, String> reauth(@RequestBody Map<String, String> body) {
      return executor.run(
          new AuditContext(AuditAction.USER_SUSPENDED, null, "_test", null, AuditDetails::of),
          () -> {
            reauthenticator.verify(body.get("password"));
            return Map.of("ok", "reauth");
          });
    }
  }
}
