package com.jvtech.gefinc.common.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Resolve a origem da requisição corrente; fora de HTTP devolve {@link RequestOrigin#NONE}. */
@Component
public class RequestOriginProvider {

  private static final String USER_AGENT = "User-Agent";
  private static final String CLIENT_HEADER = "X-Client";

  private final ClientIpResolver clientIp;
  private final DeviceLabelResolver deviceLabels;

  public RequestOriginProvider(ClientIpResolver clientIp, DeviceLabelResolver deviceLabels) {
    this.clientIp = clientIp;
    this.deviceLabels = deviceLabels;
  }

  public RequestOrigin current() {
    RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
    if (attributes instanceof ServletRequestAttributes servlet) {
      return from(servlet.getRequest());
    }
    return RequestOrigin.NONE;
  }

  /** Origem de uma requisição conhecida (ex.: na cadeia de segurança, antes do contexto web). */
  public RequestOrigin from(HttpServletRequest request) {
    String userAgent = request.getHeader(USER_AGENT);
    String client = request.getHeader(CLIENT_HEADER);
    return new RequestOrigin(
        clientIp.resolve(request),
        deviceLabels.label(userAgent, client),
        deviceLabels.clientKind(client, userAgent));
  }
}
