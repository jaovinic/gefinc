import { HttpErrorResponse } from '@angular/common/http';
import { isOfflineProblem, messageFor, toProblem } from './problem';

function http(status: number, body: unknown) {
  return new HttpErrorResponse({ status, error: body });
}

describe('problem', () => {
  it('interpreta código, detalhe, erros por campo e extensões', () => {
    const problem = toProblem(
      http(422, { code: 'VALIDATION_ERROR', detail: 'Há campos inválidos.', errors: [{ field: 'email', message: 'E-mail inválido.' }] }),
    );
    expect(problem.code).toBe('VALIDATION_ERROR');
    expect(problem.fieldErrors).toEqual({ email: 'E-mail inválido.' });
    expect(messageFor(problem)).toBe('Há campos inválidos.');
  });

  it('traduz códigos conhecidos e situações de rede e servidor', () => {
    expect(messageFor(toProblem(http(401, { code: 'INVALID_CREDENTIALS' })))).toBe('E-mail ou senha incorretos.');
    expect(messageFor(toProblem(http(409, { code: 'EMAIL_ALREADY_REGISTERED' })))).toBe('Este e-mail já está cadastrado.');
    expect(messageFor(toProblem(http(0, null)))).toContain('Sem conexão');
    expect(messageFor(toProblem(http(500, {})))).toContain('erro inesperado');
  });

  it('expõe a data limite da exclusão pendente', () => {
    const problem = toProblem(http(423, { code: 'ACCOUNT_DELETION_PENDING', deletionDate: '2026-12-10' }));
    expect(problem.extras['deletionDate']).toBe('2026-12-10');
  });

  it('ação que exige conexão tem mensagem própria, mesmo sendo um erro sem resposta do servidor', () => {
    const offline = toProblem(new HttpErrorResponse({ status: 0, error: { code: 'OFFLINE_REQUIRES_CONNECTION' } }));
    expect(messageFor(offline)).toBe('Esta ação precisa de conexão com a internet. Conecte-se e tente de novo.');
  });

  it('falta de dados salvos sem conexão tem mensagem própria e conta como falta de conexão', () => {
    const noData = toProblem(
      new HttpErrorResponse({ status: 0, error: { code: 'OFFLINE_NO_DATA', detail: 'Sem conexão e sem dados salvos desta tela' } }),
    );
    expect(messageFor(noData)).toBe('Sem conexão e sem dados salvos desta tela. Conecte-se à internet e tente de novo.');
    expect(isOfflineProblem(noData)).toBe(true);
    expect(isOfflineProblem(toProblem(http(0, null)))).toBe(true);
    expect(isOfflineProblem(toProblem(http(500, {})))).toBe(false);
    expect(isOfflineProblem(toProblem(http(409, { code: 'OFFLINE_NO_DATA' })))).toBe(false);
  });
});
