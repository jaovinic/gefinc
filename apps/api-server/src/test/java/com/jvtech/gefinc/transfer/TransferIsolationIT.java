package com.jvtech.gefinc.transfer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Princípio III: um usuário nunca lê, altera, exclui nem usa contas e transferências de outro. */
class TransferIsolationIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private TestUser bia;
  private long anaItau;
  private long anaWallet;
  private long biaItau;
  private long biaWallet;
  private JsonNode anaTransfer;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    ana = users.registerAndLogin("ana@example.com");
    bia = users.registerAndLogin("bia@example.com");
    anaItau = api.checking(ana, "Itaú");
    anaWallet = api.cash(ana, "Carteira");
    biaItau = api.checking(bia, "Bradesco");
    biaWallet = api.cash(bia, "Cofre");
    anaTransfer = api.transfer(ana, anaItau, anaWallet, "100.00", "2026-11-10");
  }

  @Test
  void outroUsuarioNaoEnxergaNaListagemNemNaConsulta() throws Exception {
    JsonNode page = api.get(bia, "/transfers?month=2026-11");
    assertThat(page.get("totalElements").asLong()).isZero();
    assertThat(page.get("content")).isEmpty();
    // Filtrar pela conta alheia também não devolve nada.
    assertThat(api.get(bia, "/transfers?month=2026-11&accountId=" + anaItau).get("content"))
        .isEmpty();
    api.call(bia, HttpMethod.GET, "/transfers/" + anaTransfer.get("id").asLong(), null)
        .andExpect(status().isNotFound());
  }

  @Test
  void edicaoEExclusaoDeTransferenciaAlheiaRespondem404SemAlterarNada() throws Exception {
    String path = "/transfers/" + anaTransfer.get("id").asLong();
    api.call(
            bia,
            HttpMethod.PUT,
            path,
            Map.of(
                "fromAccountId",
                biaItau,
                "toAccountId",
                biaWallet,
                "amount",
                "1.00",
                "transferDate",
                "2026-11-10",
                "version",
                anaTransfer.get("version").asLong()))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value("Transferência não encontrada."));
    api.call(bia, HttpMethod.DELETE, path, null).andExpect(status().isNotFound());

    JsonNode intact = api.get(ana, path);
    assertThat(intact.get("amount").asText()).isEqualTo("100.00");
    assertThat(intact.get("version").asLong()).isEqualTo(anaTransfer.get("version").asLong());
  }

  @Test
  void naoUsaContaAlheiaNemMisturaContasDePessoasDiferentes() throws Exception {
    api.call(
            bia,
            HttpMethod.POST,
            "/transfers",
            api.transferBody(biaItau, anaWallet, "10.00", "2026-11-10"))
        .andExpect(status().isNotFound());
    api.call(
            bia,
            HttpMethod.POST,
            "/transfers",
            api.transferBody(anaItau, anaWallet, "10.00", "2026-11-10"))
        .andExpect(status().isNotFound());

    // Edição também não pode redirecionar a própria transferência para conta alheia.
    JsonNode biaTransfer = api.transfer(bia, biaItau, biaWallet, "5.00", "2026-11-10");
    api.call(
            bia,
            HttpMethod.PUT,
            "/transfers/" + biaTransfer.get("id").asLong(),
            Map.of(
                "fromAccountId",
                biaItau,
                "toAccountId",
                anaWallet,
                "amount",
                "5.00",
                "transferDate",
                "2026-11-10",
                "version",
                biaTransfer.get("version").asLong()))
        .andExpect(status().isNotFound());

    assertThat(jdbc.queryForObject("select count(*) from account_transfers", Integer.class))
        .isEqualTo(2);
  }

  @Test
  void saldoDeOutroUsuarioNaoMuda() throws Exception {
    assertThat(api.balanceOf(bia, biaItau)).isEqualTo("0.00");
    assertThat(api.balanceOf(bia, biaWallet)).isEqualTo("0.00");
    assertThat(api.get(bia, "/balances").get("total").asText()).isEqualTo("0.00");
    assertThat(api.balanceOf(ana, anaWallet)).isEqualTo("100.00");
  }

  @Test
  void usoDaContaDeOutroUsuarioNaoVazaTransferencias() throws Exception {
    api.call(bia, HttpMethod.GET, "/accounts/" + anaItau + "/usage", null)
        .andExpect(status().isNotFound());
    assertThat(jdbc.queryForObject("select count(*) from account_transfers", Integer.class))
        .isEqualTo(1);
  }
}
