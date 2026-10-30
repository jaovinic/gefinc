import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Balances } from '@gefinc/core-models';
import { ACCOUNTS } from '../../testing/testbed';
import { BalancePanel } from './balance-panel';

const balances: Balances = {
  asOf: '2026-11-10',
  total: '1300.00',
  accounts: [
    { accountId: 1, name: 'Itaú', type: 'CHECKING', active: true, balance: '1500.00', openingBalance: '0.00' },
    { accountId: 3, name: 'Carteira', type: 'CASH', active: true, balance: '-200.00', openingBalance: '0.00' },
    { accountId: 9, name: 'Conta antiga', type: 'CHECKING', active: false, balance: '0.00', openingBalance: '0.00' },
  ],
  unlinkedCardPayments: '0.00',
};

@Component({
  imports: [BalancePanel],
  template: `<gef-balance-panel [data]="data" />`,
})
class Host {
  data: Balances = balances;
}

describe('BalancePanel', () => {
  function setup(data: Balances = balances) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.data = data;
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('destaca o saldo geral com a data de referência', () => {
    const { el } = setup();
    const total = el.querySelector('[data-indicator="balance-total"]')!;
    expect(total.textContent).toContain('Saldo geral');
    expect(total.querySelector('.financial-value')?.textContent).toContain('R$ 1.300,00');
    expect(total.textContent).toContain('até hoje, 10/11');
    expect(total.querySelector('.financial-value')?.className).toContain('text-display-1');
  });

  it('saldo geral positivo é verde com ícone e texto para leitor de tela', () => {
    const { el } = setup();
    const value = el.querySelector('[data-indicator="balance-total"] .financial-value')!;
    expect(value.className).toContain('text-gefinc-primary');
    expect(value.querySelector('svg')).not.toBeNull();
    expect(value.textContent).toContain('Saldo positivo');
  });

  it('saldo geral negativo é vermelho, com sinal e ícone', () => {
    const { el } = setup({ ...balances, total: '-300.00' });
    const card = el.querySelector('[data-indicator="balance-total"]')!;
    const value = card.querySelector('.financial-value')!;
    expect(value.textContent).toContain('-R$ 300,00');
    expect(value.className).toContain('text-gefinc-danger');
    expect(value.querySelector('svg')).not.toBeNull();
    expect(card.className).toContain('border-gefinc-danger');
  });

  it('mostra uma linha por conta com o saldo à direita, em vermelho quando negativo', () => {
    const { el } = setup();
    const rows = Array.from(el.querySelectorAll('[data-testid="account-balance"]'));
    expect(rows.map((r) => r.querySelector('[data-name]')?.textContent?.trim())).toEqual(['Itaú', 'Carteira']);
    expect(rows[0].querySelector('[data-balance]')?.textContent).toContain('R$ 1.500,00');
    expect(rows[1].querySelector('[data-balance]')?.textContent).toContain('-R$ 200,00');
    expect(rows[1].querySelector('[data-balance]')?.className).toContain('text-gefinc-danger');
  });

  it('esconde conta inativa com saldo zero, mas mostra a inativa com saldo', () => {
    const { el } = setup({
      ...balances,
      accounts: [
        ...balances.accounts,
        { accountId: 10, name: 'Antiga com saldo', type: 'CHECKING', active: false, balance: '5.00', openingBalance: '0.00' },
      ],
    });
    const text = el.textContent ?? '';
    expect(text).not.toContain('Conta antiga');
    expect(text).toContain('Antiga com saldo');
  });

  it('no celular as contas ficam num único cartão com divisores e no web viram grade', () => {
    const { el } = setup();
    const list = el.querySelector('ul[aria-label="Saldo por conta"]') as HTMLElement;
    expect(list.className).toContain('divide-y');
    expect(list.className).toContain('sm:grid-cols-2');
    expect(list.className).toContain('xl:grid-cols-3');
  });

  it('não tem o atalho "Gerenciar contas"', () => {
    const { el } = setup();
    expect(el.textContent).not.toContain('Gerenciar contas');
    expect(el.querySelector('a')).toBeNull();
  });

  it('avisa quando há pagamentos de cartões sem conta vinculada', () => {
    const { el } = setup({ ...balances, unlinkedCardPayments: '80.00' });
    const note = el.querySelector('[data-testid="unlinked-note"]')!;
    expect(note.textContent).toContain('R$ 80,00 em pagamentos de cartões sem conta vinculada não entram no saldo');
  });

  it('sem pagamentos sem vínculo não mostra o aviso', () => {
    const { el } = setup();
    expect(el.querySelector('[data-testid="unlinked-note"]')).toBeNull();
  });

  it('sem nenhuma conta mostra o estado vazio com chamada para cadastrar', () => {
    const { el } = setup({ ...balances, total: '0.00', accounts: [] });
    expect(el.querySelector('[data-testid="balance-empty"]')?.textContent).toContain('Nenhuma conta cadastrada');
    expect(el.querySelector('[data-testid="balance-empty"] a')?.getAttribute('href')).toBe('/accounts');
    expect(el.querySelector('[data-indicator="balance-total"] .financial-value')?.textContent).toContain('R$ 0,00');
  });

  it('usa o ícone e o titular da conta quando as contas completas são informadas', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BalancePanel);
    fixture.componentRef.setInput('data', balances);
    fixture.componentRef.setInput('accounts', [{ ...ACCOUNTS[0], holderType: 'PJ' }]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="account-balance"] [data-holder]')?.textContent).toContain('PJ');
  });
});
