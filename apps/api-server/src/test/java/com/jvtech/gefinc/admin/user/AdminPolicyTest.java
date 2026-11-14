package com.jvtech.gefinc.admin.user;

import static com.jvtech.gefinc.admin.common.AdminPolicy.Action.GRANT_ADMIN;
import static com.jvtech.gefinc.admin.common.AdminPolicy.Action.REVOKE_ADMIN;
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
}
