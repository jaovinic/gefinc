import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { Account } from '@gefinc/core-models';
import { AccountPicker } from './account-picker';

const itau = { id: 1, name: 'Itaú', type: 'CHECKING', holderType: 'PF', icon: 'bank', active: true, version: 0 } as Account;
const inter = { id: 2, name: 'Inter empresa', type: 'CHECKING', holderType: 'PJ', icon: 'briefcase', active: true, version: 0 } as Account;
const nubank = {
  id: 3, name: 'Nubank Roxinho', type: 'CREDIT_CARD', holderType: 'PJ', icon: 'card-gold', bankAccountId: 2,
  bankAccountName: 'Inter empresa', closingDay: 10, dueDay: 17, active: true, version: 0,
} as Account;
const velha = { id: 4, name: 'Conta velha', type: 'CHECKING', holderType: 'PF', icon: 'bank', active: false, version: 0 } as Account;

@Component({
  imports: [AccountPicker, ReactiveFormsModule],
  template: `
    <gef-account-picker label="Conta ou cartão" [accounts]="accounts" [formControl]="control" emptyMessage="Nenhuma conta ativa." />
  `,
})
class Host {
  accounts: Account[] = [itau, inter, nubank, velha];
  control = new FormControl<number | null>(null);
}

describe('gef-account-picker', () => {
  function render(setup: (host: Host) => void = () => undefined) {
    const fixture = TestBed.createComponent(Host);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = () => el.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
    const options = () => Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
    const open = () => {
      trigger().click();
      fixture.detectChanges();
    };
    return { fixture, host: fixture.componentInstance, el, trigger, options, open };
  }

  it('sem escolha mostra a orientação e o botão tem o rótulo do campo', () => {
    const { trigger, el } = render();
    expect(trigger().textContent).toContain('Escolha');
    expect(el.querySelector('label')?.textContent).toContain('Conta ou cartão');
    expect(el.querySelector('label')?.getAttribute('for')).toBe(trigger().id);
  });

  it('abre a lista com ícone e nome, e para cartão a conta vinculada e o selo', () => {
    const { open, options } = render();
    open();
    const labels = options().map((o) => o.textContent ?? '');
    expect(options().length).toBe(3);
    expect(labels[2]).toContain('Nubank Roxinho');
    expect(labels[2]).toContain('Inter empresa');
    expect(labels[2]).toContain('PJ');
    expect(options()[0].querySelectorAll('svg').length).toBe(1);
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('contas inativas ficam fora da lista', () => {
    const { open, options } = render();
    open();
    expect(options().some((o) => o.textContent?.includes('Conta velha'))).toBe(false);
  });

  it('uma conta inativa já escolhida continua aparecendo no campo e na lista', () => {
    const { open, options, trigger } = render((h) => h.control.setValue(4));
    expect(trigger().textContent).toContain('Conta velha');
    open();
    expect(options().some((o) => o.textContent?.includes('Conta velha'))).toBe(true);
  });

  it('escolher uma opção grava o id, fecha a lista e mostra o escolhido', () => {
    const { fixture, host, open, options, trigger } = render();
    open();
    options()[2].click();
    fixture.detectChanges();
    expect(host.control.value).toBe(3);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger().textContent).toContain('Nubank Roxinho');
  });

  it('a opção marcada tem aria-selected', () => {
    const { open, options } = render((h) => h.control.setValue(2));
    open();
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    expect(options()[0].getAttribute('aria-selected')).toBe('false');
  });

  it('sem contas mostra a mensagem de vazio', () => {
    const { open } = render((h) => (h.accounts = []));
    open();
    expect(document.body.textContent).toContain('Nenhuma conta ativa.');
  });

  it('desabilitado não abre', () => {
    const { fixture, host, trigger } = render();
    host.control.disable();
    fixture.detectChanges();
    expect(trigger().disabled).toBe(true);
  });
});
