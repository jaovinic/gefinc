package com.jvtech.gefinc.admin.audit;

/**
 * Resumo em pt-BR de uma linha da trilha, só a partir da ação e do resultado: nada de dado pessoal,
 * valor livre ou justificativa. O {@code switch} sem {@code default} faz o compilador exigir um
 * texto para toda ação nova do catálogo.
 */
final class AuditSummary {

  private AuditSummary() {}

  /**
   * {@code done}: o que aconteceu; {@code attempt}: a ação no infinitivo, para recusas e falhas.
   */
  private record Text(String done, String attempt) {}

  static String of(AuditAction action, AuditResult result) {
    if (action == AuditAction.ACCESS_DENIED) {
      return "Acesso ao painel negado";
    }
    if (action == AuditAction.REVERT_ATTEMPT) {
      return "Tentativa de reverter uma ação registrada";
    }
    Text text = text(action);
    return switch (result) {
      case SUCCESS -> text.done();
      case REFUSED -> "Tentativa recusada de " + text.attempt();
      case FAILED -> "Falha ao " + text.attempt();
    };
  }

  private static Text text(AuditAction action) {
    return switch (action) {
      case USER_DETAIL_OPENED ->
          new Text("Detalhe do usuário aberto", "abrir o detalhe do usuário");
      case USER_SUSPENDED -> new Text("Usuário suspenso", "suspender o usuário");
      case USER_REACTIVATED -> new Text("Usuário reativado", "reativar o usuário");
      case LOGIN_LOCK_CLEARED ->
          new Text("Bloqueio de login retirado", "retirar o bloqueio de login");
      case SESSION_REVOKED -> new Text("Sessão encerrada", "encerrar a sessão");
      case SESSIONS_REVOKED_ALL ->
          new Text("Todas as sessões encerradas", "encerrar todas as sessões");
      case SYSTEM_SESSIONS_REVOKED ->
          new Text(
              "Sessões de todos os usuários encerradas",
              "encerrar as sessões de todos os usuários");
      case PASSWORD_RESET_SENT ->
          new Text(
              "E-mail de redefinição de senha enviado", "enviar o e-mail de redefinição de senha");
      case PASSWORD_RESET_FORCED ->
          new Text("Redefinição de senha forçada", "forçar a redefinição de senha");
      case USER_RENAMED -> new Text("Nome de exibição alterado", "alterar o nome de exibição");
      case EMAIL_CHANGE_REQUESTED ->
          new Text("Troca de e-mail solicitada", "solicitar a troca de e-mail");
      case EMAIL_CHANGE_CONFIRMED ->
          new Text("Troca de e-mail confirmada", "confirmar a troca de e-mail");
      case EMAIL_CHANGE_FAILED ->
          new Text("Troca de e-mail não concluída", "concluir a troca de e-mail");
      case EMAIL_CHANGE_CANCELED ->
          new Text("Troca de e-mail cancelada", "cancelar a troca de e-mail");
      case ROLE_GRANTED ->
          new Text("Perfil de administrador concedido", "conceder o perfil de administrador");
      case ROLE_REVOKED ->
          new Text("Perfil de administrador retirado", "retirar o perfil de administrador");
      case DELETION_REQUESTED ->
          new Text("Exclusão da conta agendada", "agendar a exclusão da conta");
      case DELETION_ANTICIPATED ->
          new Text("Exclusão da conta antecipada", "antecipar a exclusão da conta");
      case DELETION_CANCELED ->
          new Text("Exclusão da conta cancelada", "cancelar a exclusão da conta");
      case ACCOUNT_ERASED ->
          new Text("Conta excluída definitivamente", "excluir a conta definitivamente");
      case COMMUNICATION_RESENT -> new Text("Comunicação reenviada", "reenviar a comunicação");
      case COMMUNICATION_DISCARDED -> new Text("Comunicação descartada", "descartar a comunicação");
      case EMAIL_TEST_SENT -> new Text("E-mail de teste enviado", "enviar o e-mail de teste");
      case INVITATION_CREATED -> new Text("Convite criado", "criar o convite");
      case INVITATION_RESENT -> new Text("Convite reenviado", "reenviar o convite");
      case INVITATION_CANCELED -> new Text("Convite cancelado", "cancelar o convite");
      case REASON_CREATED -> new Text("Motivo de exclusão criado", "criar o motivo de exclusão");
      case REASON_UPDATED ->
          new Text("Motivo de exclusão alterado", "alterar o motivo de exclusão");
      case REASON_DEACTIVATED ->
          new Text("Motivo de exclusão desativado", "desativar o motivo de exclusão");
      case REASON_ACTIVATED ->
          new Text("Motivo de exclusão ativado", "ativar o motivo de exclusão");
      case PARAMETER_CHANGED ->
          new Text("Parâmetro do sistema alterado", "alterar o parâmetro do sistema");
      case ACCESS_DENIED, REVERT_ATTEMPT -> throw new IllegalStateException(action.name());
    };
  }
}
