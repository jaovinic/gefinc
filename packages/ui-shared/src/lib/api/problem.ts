import { HttpErrorResponse } from '@angular/common/http';
import { ERROR_CODES } from '@gefinc/core-models';

/** Erro da API já interpretado (corpo `problem+json` do contrato). */
export interface ApiProblem {
  status: number;
  code: string | null;
  detail: string | null;
  /** Erros por campo (`errors[].field` → mensagem). */
  fieldErrors: Record<string, string>;
  /** Membros de extensão do problema (ex.: `deletionDate`, `remainingBalance`). */
  extras: Record<string, unknown>;
}

export function toProblem(error: unknown): ApiProblem {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: 0, code: null, detail: null, fieldErrors: {}, extras: {} };
  }
  const body = (error.error ?? {}) as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  if (Array.isArray(body['errors'])) {
    for (const item of body['errors'] as { field?: string; message?: string }[]) {
      if (item.field && item.message) {
        fieldErrors[item.field] = item.message;
      }
    }
  }
  return {
    status: error.status,
    code: typeof body['code'] === 'string' ? body['code'] : null,
    detail: typeof body['detail'] === 'string' ? body['detail'] : null,
    fieldErrors,
    extras: body,
  };
}

/** Mensagem amigável em português para mostrar ao usuário. */
export function messageFor(problem: ApiProblem): string {
  if (problem.status === 0) {
    return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
  }
  switch (problem.code) {
    case 'INVALID_CREDENTIALS':
      return 'E-mail ou senha incorretos.';
    case 'EMAIL_ALREADY_REGISTERED':
      return 'Este e-mail já está cadastrado.';
    case 'TOO_MANY_REQUESTS':
      return 'Muitas solicitações. Tente novamente mais tarde.';
    case ERROR_CODES.invalidResetToken:
      return 'Este link é inválido, já foi usado ou expirou. Solicite um novo.';
    case ERROR_CODES.staleVersion:
      return 'Este registro foi alterado em outro dispositivo. Recarregue para ver a versão atual.';
    default:
      break;
  }
  if (problem.status >= 500) {
    return 'Ocorreu um erro inesperado. Tente novamente em instantes.';
  }
  return problem.detail ?? 'Não foi possível concluir a operação.';
}
