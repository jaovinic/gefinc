package com.jvtech.gefinc.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * A trilha é só de leitura e sem exportação (SC-005, FR-018, FR-020): enumera as rotas reais em
 * {@code /admin/audit/**} e exige exatamente duas, ambas {@code GET}; qualquer outro método dá
 * {@code 405} ao administrador, {@code 403} ao usuário comum e {@code 401} ao visitante, e nenhuma
 * rota de exportação existe em lugar nenhum da API.
 */
class AuditApiSurfaceIT extends IntegrationTestBase {

  private static final List<HttpMethod> WRITES =
      List.of(HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE);

  private static final List<String> PATHS = List.of("/admin/audit", "/admin/audit/1");

  @Autowired
  @Qualifier("requestMappingHandlerMapping")
  private RequestMappingHandlerMapping handlerMapping;

  private String adminToken;
  private String commonToken;

  @BeforeEach
  void init() throws Exception {
    seed.createAdmin("adm@teste.com");
    seed.createUser("comum@teste.com");
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    adminToken = users.login("adm@teste.com", TestUsers.PASSWORD).get("accessToken").asText();
    commonToken = users.login("comum@teste.com", TestUsers.PASSWORD).get("accessToken").asText();
  }

  private Map<RequestMappingInfo, HandlerMethod> handlers() {
    return handlerMapping.getHandlerMethods();
  }

  private static Set<String> patterns(RequestMappingInfo info) {
    Set<String> patterns = new TreeSet<>();
    info.getPathPatternsCondition().getPatterns().forEach(p -> patterns.add(p.getPatternString()));
    return patterns;
  }

  @Test
  void existemExatamenteDuasRotasSobAdminAuditAmbasGet() {
    List<String> found = new ArrayList<>();
    for (Map.Entry<RequestMappingInfo, HandlerMethod> entry : handlers().entrySet()) {
      Set<RequestMethod> methods = entry.getKey().getMethodsCondition().getMethods();
      for (String pattern : patterns(entry.getKey())) {
        if (pattern.equals("/admin/audit") || pattern.startsWith("/admin/audit/")) {
          assertThat(methods).as("métodos de %s", pattern).containsExactly(RequestMethod.GET);
          found.add(pattern);
        }
      }
    }

    assertThat(found).containsExactlyInAnyOrder("/admin/audit", "/admin/audit/{auditId}");
  }

  @Test
  void oControllerSoTemDoisMetodosDeRotaAmbosGet() {
    List<Method> routed =
        Arrays.stream(AuditController.class.getDeclaredMethods())
            .filter(m -> AnnotatedElementUtils.hasAnnotation(m, RequestMapping.class))
            .toList();

    assertThat(routed).hasSize(2);
    for (Method method : routed) {
      RequestMapping mapping =
          AnnotatedElementUtils.findMergedAnnotation(method, RequestMapping.class);
      assertThat(mapping.method()).as(method.getName()).containsExactly(RequestMethod.GET);
    }
  }

  @Test
  void nenhumaRotaDaApiTemNomeDeExportacaoOuCsv() {
    for (RequestMappingInfo info : handlers().keySet()) {
      for (String pattern : patterns(info)) {
        assertThat(pattern.toLowerCase())
            .as("rota %s", pattern)
            .doesNotContain("export")
            .doesNotContain("csv")
            .doesNotContain("download");
      }
    }
  }

  private MvcResult send(HttpMethod method, String uri, String token) throws Exception {
    var builder = request(method, uri).contentType(MediaType.APPLICATION_JSON).content("{}");
    if (token != null) {
      builder.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }
    return mockMvc.perform(builder).andReturn();
  }

  @Test
  void escritaEmAdminAuditDa405ParaAdminEBarraOsDemaisSemTocarNaTrilha() throws Exception {
    long before = jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class);

    for (String path : PATHS) {
      for (HttpMethod method : WRITES) {
        assertThat(send(method, path, adminToken).getResponse().getStatus())
            .as("%s %s como administrador", method, path)
            .isEqualTo(405);
        assertThat(send(method, path, commonToken).getResponse().getStatus())
            .as("%s %s como usuário comum", method, path)
            .isEqualTo(403);
        assertThat(send(method, path, null).getResponse().getStatus())
            .as("%s %s sem autenticação", method, path)
            .isEqualTo(401);
      }
    }

    // Só as negativas (acesso negado, deduplicadas) entram na trilha; nada é alterado nem apagado.
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action <> 'ACCESS_DENIED'", Long.class))
        .isZero();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class))
        .isGreaterThanOrEqualTo(before);
  }

  @Test
  void rotasDeExportacaoNaoExistemEnaoDevolvem200() throws Exception {
    for (String path :
        List.of("/admin/audit/export", "/admin/audit/export.csv", "/admin/audit.csv")) {
      MvcResult result = send(HttpMethod.GET, path, adminToken);

      assertThat(result.getResponse().getStatus()).as("GET %s", path).isIn(400, 404);
      assertThat(result.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION)).isNull();
      assertThat(result.getResponse().getContentType()).doesNotContain("csv");
    }
  }

  @Test
  void pedirCsvNaLeituraNaoGeraArquivo() throws Exception {
    var builder =
        request(HttpMethod.GET, "/admin/audit")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
            .header(HttpHeaders.ACCEPT, "text/csv");

    MvcResult result = mockMvc.perform(builder).andReturn();

    assertThat(result.getResponse().getContentType()).doesNotContain("csv");
    assertThat(result.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION)).isNull();
    assertThat(result.getResponse().getStatus()).isNotEqualTo(200);
  }
}
