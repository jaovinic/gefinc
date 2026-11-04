import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PendingListPage } from './pending-list.page';
import { PendingOp, PendingQueue } from './pending-queue';
import { SyncEngine } from './sync-engine';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL, CLIENT_KIND, MemoryTokenStore, TokenStore } from '@gefinc/ui-shared';

describe('PendingListPage (pendências de envio)', () => {
  const ops = signal<PendingOp[]>([]);
  const queue = {
    ops,
    remove: jest.fn(async (id: string) => ops.update((l) => l.filter((o) => o.id !== id))),
    retry: jest.fn(async () => undefined),
  };
  const flush = jest.fn(async () => ({ sent: 0, rejected: 0, stopped: null }));

  const pending: PendingOp = { id: 'a', kind: 'CREATE_GROUP', method: 'POST', schema: 2, path: '/transaction-groups', body: { description: 'Mercado' }, createdAt: 1, state: 'PENDING', label: 'Mercado' };
  const rejected: PendingOp = { id: 'b', kind: 'PAY', method: 'POST', schema: 2, path: '/transactions/9/pay', body: { paymentDate: '2026-11-10' }, createdAt: 2, state: 'REJECTED', label: 'Pagamento do lançamento 9', error: 'Este lançamento já está pago.' };

  function render() {
    const fixture = TestBed.createComponent(PendingListPage);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    ops.set([pending, rejected]);
    queue.remove.mockClear();
    queue.retry.mockClear();
    flush.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/api/v1' },
        { provide: CLIENT_KIND, useValue: 'mobile' },
        { provide: TokenStore, useClass: MemoryTokenStore },
        { provide: PendingQueue, useValue: queue },
        { provide: SyncEngine, useValue: { flush, syncing: signal(false) } },
      ],
    });
  });

  it('separa o que aguarda envio do que foi recusado, com o motivo da recusa', () => {
    const { el } = render();

    expect(el.querySelector('h1')?.textContent).toContain('Pendências de envio');
    expect(el.querySelector('[data-testid="waiting"]')?.textContent).toContain('Mercado');
    const recused = el.querySelector('[data-testid="rejected"]') as HTMLElement;
    expect(recused.textContent).toContain('Pagamento do lançamento 9');
    expect(recused.textContent).toContain('Este lançamento já está pago.');
  });

  it('descartar pede confirmação e só então remove a operação', async () => {
    const { fixture, el } = render();

    (el.querySelector('button[aria-label="Descartar Pagamento do lançamento 9"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(queue.remove).not.toHaveBeenCalled();
    const dialog = el.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Descartar "Pagamento do lançamento 9"? A operação ainda não enviada será perdida.');
    (el.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(queue.remove).toHaveBeenCalledWith('b');
  });

  it('descartar um lançamento recusado confirma com o botão Descartar lançamento', async () => {
    const created: PendingOp = { ...pending, id: 'c', state: 'REJECTED', label: 'Farmácia', error: 'Conta inativa.' };
    ops.set([created]);
    const { fixture, el } = render();

    (el.querySelector('button[aria-label="Descartar Farmácia"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain('Descartar "Farmácia"? O lançamento ainda não enviado será perdido.');
    const confirm = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Descartar lançamento') as HTMLButtonElement;
    confirm.click();
    await fixture.whenStable();

    expect(queue.remove).toHaveBeenCalledWith('c');
  });

  it('cancelar o descarte mantém a operação', () => {
    const { fixture, el } = render();

    (el.querySelector('button[aria-label="Descartar Pagamento do lançamento 9"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(queue.remove).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('tentar de novo volta a operação para a fila e envia', async () => {
    const { el } = render();

    (el.querySelector('button[aria-label="Tentar de novo Pagamento do lançamento 9"]') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.retry).toHaveBeenCalledWith('b');
    expect(flush).toHaveBeenCalled();
  });

  describe('edições e exclusões (fase B)', () => {
    const edit: PendingOp = {
      id: 'e', kind: 'EDIT_TX', method: 'PATCH', schema: 2, path: '/transactions/9', body: { amount: '20.00', version: 3 }, createdAt: Date.now(), state: 'PENDING',
      label: 'Editar lançamento 9 (valor R$ 20,00)', entity: { type: 'TRANSACTION', id: 9 },
    };
    const del: PendingOp = {
      id: 'd', kind: 'DELETE_GROUP', method: 'DELETE', schema: 2, path: '/transaction-groups/4?confirm=true', body: null, createdAt: Date.now(), state: 'PENDING',
      label: 'Excluir lançamento do grupo 4', entity: { type: 'GROUP', id: 4 },
    };

    it('mostra as operações novas na fila de espera, com o rótulo de cada uma', () => {
      ops.set([edit, del]);
      const { el } = render();

      const waiting = el.querySelector('[data-testid="waiting"]') as HTMLElement;
      expect(waiting.textContent).toContain('Editar lançamento 9 (valor R$ 20,00)');
      expect(waiting.textContent).toContain('Excluir lançamento do grupo 4');
      expect(waiting.textContent).toContain('Será enviado quando houver conexão.');
      expect(waiting.textContent).not.toContain('há mais de 6 dias');
    });

    it('edição recusada mostra o motivo, oferece Tentar de novo e Descartar, mas não Corrigir', () => {
      ops.set([{ ...edit, state: 'REJECTED', error: 'Este registro foi alterado em outro dispositivo. Recarregue para ver a versão atual.' }]);
      const { el } = render();

      const recused = el.querySelector('[data-testid="rejected"]') as HTMLElement;
      expect(recused.textContent).toContain('alterado em outro dispositivo');
      expect(recused.textContent).toContain('descarte e repita a ação na lista atualizada');
      expect(el.querySelector('button[aria-label="Tentar de novo Editar lançamento 9 (valor R$ 20,00)"]')).not.toBeNull();
      expect(el.querySelector('button[aria-label="Descartar Editar lançamento 9 (valor R$ 20,00)"]')).not.toBeNull();
      expect(recused.textContent).not.toContain('Corrigir');
    });

    it('exclusão recusada também só oferece Tentar de novo e Descartar, e descartar remove da fila', async () => {
      ops.set([{ ...del, state: 'REJECTED', error: 'O saldo da fatura ficaria negativo.' }]);
      const { fixture, el } = render();

      expect(el.textContent).not.toContain('Corrigir');
      (el.querySelector('button[aria-label="Descartar Excluir lançamento do grupo 4"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain('A operação ainda não enviada será perdida.');
      (el.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(queue.remove).toHaveBeenCalledWith('d');
    });

    it('tentar de novo uma edição recusada volta à fila e envia', async () => {
      ops.set([{ ...edit, state: 'REJECTED', error: 'x' }]);
      const { el } = render();

      (el.querySelector('button[aria-label="Tentar de novo Editar lançamento 9 (valor R$ 20,00)"]') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();

      expect(queue.retry).toHaveBeenCalledWith('e');
      expect(flush).toHaveBeenCalled();
    });

    it('operação esperando há mais de 6 dias avisa para conferir o resultado (o servidor só reconhece repetições por 7 dias)', () => {
      const old = Date.now() - 6.5 * 86_400_000;
      ops.set([{ ...edit, createdAt: old }, { ...del, createdAt: Date.now() - 2 * 86_400_000 }]);
      const { el } = render();

      const items = el.querySelectorAll('[data-testid="waiting"] li');
      expect(items[0].textContent).toContain('Na fila há mais de 6 dias');
      expect(items[0].textContent).toContain('confira');
      expect(items[1].textContent).not.toContain('há mais de 6 dias');
    });
  });

  it('sem pendências mostra o estado vazio', () => {
    ops.set([]);
    const { el } = render();

    expect(el.textContent).toContain('Nenhuma pendência');
  });
});
