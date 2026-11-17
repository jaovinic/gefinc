package com.jvtech.gefinc.admin.user;

import static com.jvtech.gefinc.admin.common.AdminPolicy.Action.CLEAR_LOGIN_LOCK;
import static com.jvtech.gefinc.admin.common.AdminPolicy.Action.FORCE_PASSWORD_RESET;
import static com.jvtech.gefinc.admin.common.AdminPolicy.Action.GRANT_ADMIN;
import static com.jvtech.gefinc.admin.common.AdminPolicy.Action.REACTIVATE;
import static com.jvtech.gefinc.admin.common.AdminPolicy.Action.REVOKE_ADMIN;
import static com.jvtech.gefinc.admin.common.AdminPolicy.Action.REVOKE_OTHER_SESSION;
import static com.jvtech.gefinc.admin.common.AdminPolicy.Action.REVOKE_SESSIONS;
import static com.jvtech.gefinc.admin.common.AdminPolicy.Action.SEND_PASSWORD_RESET;
import static com.jvtech.gefinc.admin.common.AdminPolicy.Action.SUSPEND;
import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.admin.common.AdminPolicy;
import com.jvtech.gefinc.admin.common.AdminPolicy.Subject;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.user.UserRole;
import org.junit.jupiter.api.Test;

/** Função pura das regras do perfil de administrador (sem banco). */
class AdminPolicyTest {

  private static final Subject ADMIN = new Subject(1, UserRole.ADMIN, true);
  private static final Subject OTHER_ADMIN = new Subject(2, UserRole.ADMIN, true);
  private static final Subject SUSPENDED_ADMIN = new Subject(3, UserRole.ADMIN, false);
  private static final Subject COMMON = new Subject(4, UserRole.USER, true);
  private static final Subject SUSPENDED_COMMON = new Subject(5, UserRole.USER, false);
  private static final Subject ROOT = new Subject(6, UserRole.ROOT, true);

  @Test
  void raizEhIntocavelEEssaChecagemVemPrimeiro() {
    assertThat(AdminPolicy.decide(REVOKE_ADMIN, ADMIN, ROOT, 5)).contains(ErrorCode.ROOT_PROTECTED);
    assertThat(AdminPolicy.decide(GRANT_ADMIN, ADMIN, ROOT, 5)).contains(ErrorCode.ROOT_PROTECTED);
    // nem o próprio raiz contra si mesmo: a proteção vence a regra de autoatendimento
    assertThat(AdminPolicy.decide(REVOKE_ADMIN, ROOT, ROOT, 0)).contains(ErrorCode.ROOT_PROTECTED);
  }

  @Test
  void administradorNaoAgeContraSiMesmoESeSobrepoeAoUltimoAdministrador() {
    assertThat(AdminPolicy.decide(REVOKE_ADMIN, ADMIN, ADMIN, 0))
        .contains(ErrorCode.SELF_ACTION_FORBIDDEN);
    assertThat(AdminPolicy.decide(REVOKE_ADMIN, ADMIN, ADMIN, 3))
        .contains(ErrorCode.SELF_ACTION_FORBIDDEN);
    assertThat(AdminPolicy.decide(GRANT_ADMIN, ADMIN, ADMIN, 3))
        .contains(ErrorCode.SELF_ACTION_FORBIDDEN);
  }

  @Test
  void naoRetiraOPerfilDoUltimoAdministradorAtivo() {
    assertThat(AdminPolicy.decide(REVOKE_ADMIN, ADMIN, OTHER_ADMIN, 0))
        .contains(ErrorCode.LAST_ADMIN);
    assertThat(AdminPolicy.decide(REVOKE_ADMIN, ADMIN, OTHER_ADMIN, 1)).isEmpty();
    assertThat(AdminPolicy.decide(REVOKE_ADMIN, ADMIN, OTHER_ADMIN, 7)).isEmpty();
  }

  @Test
  void retirarOPerfilDeAdministradorSuspensoEPermitidoMesmoSemOutrosAtivos() {
    assertThat(AdminPolicy.decide(REVOKE_ADMIN, ADMIN, SUSPENDED_ADMIN, 0)).isEmpty();
  }

  @Test
  void concederExigeAlvoAtivo() {
    assertThat(AdminPolicy.decide(GRANT_ADMIN, ADMIN, SUSPENDED_COMMON, 1))
        .contains(ErrorCode.ACCOUNT_NOT_USABLE);
    assertThat(AdminPolicy.decide(GRANT_ADMIN, ADMIN, COMMON, 1)).isEmpty();
  }

  @Test
  void operacoesIdempotentesSaoPermitidas() {
    assertThat(AdminPolicy.decide(GRANT_ADMIN, ADMIN, OTHER_ADMIN, 0)).isEmpty();
    assertThat(AdminPolicy.decide(GRANT_ADMIN, ADMIN, SUSPENDED_ADMIN, 0)).isEmpty();
    assertThat(AdminPolicy.decide(REVOKE_ADMIN, ADMIN, COMMON, 0)).isEmpty();
    assertThat(AdminPolicy.decide(REVOKE_ADMIN, ADMIN, SUSPENDED_COMMON, 0)).isEmpty();
  }

  @Test
  void soAcoesQueMudamOConjuntoDeAdministradoresAtivosPedemATrava() {
    assertThat(AdminPolicy.changesAdminSet(REVOKE_ADMIN, OTHER_ADMIN)).isTrue();
    assertThat(AdminPolicy.changesAdminSet(REVOKE_ADMIN, SUSPENDED_ADMIN)).isFalse();
    assertThat(AdminPolicy.changesAdminSet(REVOKE_ADMIN, COMMON)).isFalse();
    assertThat(AdminPolicy.changesAdminSet(REVOKE_ADMIN, ROOT)).isFalse();
    assertThat(AdminPolicy.changesAdminSet(GRANT_ADMIN, COMMON)).isFalse();
    assertThat(AdminPolicy.changesAdminSet(GRANT_ADMIN, OTHER_ADMIN)).isFalse();
  }

  @Test
  void suspenderSegueRaizSiMesmoEUltimoAdministradorNessaOrdem() {
    assertThat(AdminPolicy.decide(SUSPEND, ADMIN, ROOT, 5)).contains(ErrorCode.ROOT_PROTECTED);
    assertThat(AdminPolicy.decide(SUSPEND, ROOT, ROOT, 0)).contains(ErrorCode.ROOT_PROTECTED);
    assertThat(AdminPolicy.decide(SUSPEND, ADMIN, ADMIN, 0))
        .contains(ErrorCode.SELF_ACTION_FORBIDDEN);
    assertThat(AdminPolicy.decide(SUSPEND, ADMIN, OTHER_ADMIN, 0)).contains(ErrorCode.LAST_ADMIN);
    assertThat(AdminPolicy.decide(SUSPEND, ADMIN, OTHER_ADMIN, 1)).isEmpty();
  }

  @Test
  void suspenderAdministradorJaSuspensoOuUsuarioComumNaoDependeDeOutrosAdministradores() {
    assertThat(AdminPolicy.decide(SUSPEND, ADMIN, SUSPENDED_ADMIN, 0)).isEmpty();
    assertThat(AdminPolicy.decide(SUSPEND, ADMIN, COMMON, 0)).isEmpty();
    assertThat(AdminPolicy.decide(SUSPEND, ADMIN, SUSPENDED_COMMON, 0)).isEmpty();
  }

  @Test
  void suspenderUmAdministradorAtivoReduzOConjuntoEPedeATrava() {
    assertThat(AdminPolicy.changesAdminSet(SUSPEND, OTHER_ADMIN)).isTrue();
    assertThat(AdminPolicy.changesAdminSet(SUSPEND, SUSPENDED_ADMIN)).isFalse();
    assertThat(AdminPolicy.changesAdminSet(SUSPEND, COMMON)).isFalse();
    assertThat(AdminPolicy.changesAdminSet(SUSPEND, ROOT)).isFalse();
    assertThat(AdminPolicy.changesAdminSet(REACTIVATE, OTHER_ADMIN)).isFalse();
    assertThat(AdminPolicy.changesAdminSet(REVOKE_SESSIONS, OTHER_ADMIN)).isFalse();
  }

  @Test
  void reativarEPermitidoParaTodosExcetoORaiz() {
    assertThat(AdminPolicy.decide(REACTIVATE, ADMIN, COMMON, 0)).isEmpty();
    assertThat(AdminPolicy.decide(REACTIVATE, ADMIN, SUSPENDED_ADMIN, 0)).isEmpty();
    assertThat(AdminPolicy.decide(REACTIVATE, ADMIN, ADMIN, 0)).isEmpty();
    assertThat(AdminPolicy.decide(REACTIVATE, ADMIN, ROOT, 0)).contains(ErrorCode.ROOT_PROTECTED);
  }

  @Test
  void encerrarTodasAsSessoesRecusaORaizEASiMesmo() {
    assertThat(AdminPolicy.decide(REVOKE_SESSIONS, ADMIN, ROOT, 0))
        .contains(ErrorCode.ROOT_PROTECTED);
    assertThat(AdminPolicy.decide(REVOKE_SESSIONS, ADMIN, ADMIN, 0))
        .contains(ErrorCode.SELF_ACTION_FORBIDDEN);
    assertThat(AdminPolicy.decide(REVOKE_SESSIONS, ADMIN, OTHER_ADMIN, 0)).isEmpty();
    assertThat(AdminPolicy.decide(REVOKE_SESSIONS, ADMIN, COMMON, 0)).isEmpty();
  }

  @Test
  void encerrarUmaSessaoQueNaoEAAtualPermiteOProprioAdministradorMasNaoORaiz() {
    assertThat(AdminPolicy.decide(REVOKE_OTHER_SESSION, ADMIN, ADMIN, 0)).isEmpty();
    assertThat(AdminPolicy.decide(REVOKE_OTHER_SESSION, ADMIN, COMMON, 0)).isEmpty();
    assertThat(AdminPolicy.decide(REVOKE_OTHER_SESSION, ADMIN, ROOT, 0))
        .contains(ErrorCode.ROOT_PROTECTED);
  }

  @Test
  void retirarOBloqueioDeLoginRecusaSoORaiz() {
    assertThat(AdminPolicy.decide(CLEAR_LOGIN_LOCK, ADMIN, COMMON, 0)).isEmpty();
    assertThat(AdminPolicy.decide(CLEAR_LOGIN_LOCK, ADMIN, ADMIN, 0)).isEmpty();
    assertThat(AdminPolicy.decide(CLEAR_LOGIN_LOCK, ADMIN, ROOT, 0))
        .contains(ErrorCode.ROOT_PROTECTED);
  }

  @Test
  void reenviarRedefinicaoDeSenhaPermiteORaizMasExigeContaAtiva() {
    assertThat(AdminPolicy.decide(SEND_PASSWORD_RESET, ADMIN, ROOT, 0)).isEmpty();
    assertThat(AdminPolicy.decide(SEND_PASSWORD_RESET, ADMIN, COMMON, 0)).isEmpty();
    assertThat(AdminPolicy.decide(SEND_PASSWORD_RESET, ADMIN, ADMIN, 0)).isEmpty();
    assertThat(AdminPolicy.decide(SEND_PASSWORD_RESET, ADMIN, SUSPENDED_COMMON, 0))
        .contains(ErrorCode.ACCOUNT_NOT_USABLE);
    assertThat(
            AdminPolicy.decide(SEND_PASSWORD_RESET, ADMIN, new Subject(6, UserRole.ROOT, false), 0))
        .contains(ErrorCode.ACCOUNT_NOT_USABLE);
  }

  @Test
  void forcarRedefinicaoDeSenhaRecusaORaizEExigeContaAtiva() {
    assertThat(AdminPolicy.decide(FORCE_PASSWORD_RESET, ADMIN, ROOT, 0))
        .contains(ErrorCode.ROOT_PROTECTED);
    assertThat(AdminPolicy.decide(FORCE_PASSWORD_RESET, ADMIN, COMMON, 0)).isEmpty();
    assertThat(AdminPolicy.decide(FORCE_PASSWORD_RESET, ADMIN, OTHER_ADMIN, 0)).isEmpty();
    assertThat(AdminPolicy.decide(FORCE_PASSWORD_RESET, ADMIN, SUSPENDED_COMMON, 0))
        .contains(ErrorCode.ACCOUNT_NOT_USABLE);
  }
}
