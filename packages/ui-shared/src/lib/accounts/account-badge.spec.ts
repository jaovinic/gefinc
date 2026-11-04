import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccountBadge } from './account-badge';

const pf = { name: 'Itaú pessoal', type: 'CHECKING', holderType: 'PF', icon: 'landmark' } as const;
const pj = { name: 'Inter empresa', type: 'CHECKING', holderType: 'PJ', icon: 'briefcase' } as const;
const card = {
  name: 'Nubank Roxinho',
  type: 'CREDIT_CARD',
  holderType: 'PJ',
  icon: 'card-gold',
  bankAccountName: 'Inter empresa',
} as const;

@Component({
  imports: [AccountBadge],
  template: `
    <gef-account-badge [account]="account" [showHolder]="showHolder" [showBank]="showBank" />
  `,
})
class Host {
  account: Record<string, unknown> = pf;
  showHolder = true;
  showBank = false;
}

describe('gef-account-badge', () => {
  function render(setup: (host: Host) => void = () => undefined) {
    const fixture = TestBed.createComponent(Host);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('mostra o ícone e o nome da conta', () => {
    const el = render();
    expect(el.textContent).toContain('Itaú pessoal');
    expect(el.querySelectorAll('svg').length).toBe(1);
  });

  it('mostra o selo PF ou PJ quando informado', () => {
    expect(render().querySelector('[data-holder]')?.textContent?.trim()).toBe('PF');
    const el = render((h) => (h.account = pj));
    expect(el.querySelector('[data-holder]')?.textContent?.trim()).toBe('PJ');
  });

  it('esconde o selo quando pedido ou quando a conta não tem titular', () => {
    expect(render((h) => (h.showHolder = false)).querySelector('[data-holder]')).toBeNull();
    const cash = render((h) => (h.account = { name: 'Carteira', type: 'CASH' }));
    expect(cash.querySelector('[data-holder]')).toBeNull();
  });

  it('conta sem ícone (cópia local antiga) usa o ícone padrão do tipo', () => {
    const el = render((h) => (h.account = { name: 'Itaú', type: 'CHECKING' }));
    expect(el.querySelector('svg path')?.getAttribute('d')).toContain('M3 9.5');
    expect(el.textContent).toContain('Itaú');
  });

  it('cartão mostra a conta bancária vinculada e o selo herdado', () => {
    const el = render((h) => {
      h.account = card;
      h.showBank = true;
    });
    expect(el.textContent).toContain('Nubank Roxinho');
    expect(el.textContent).toContain('Inter empresa');
    expect(el.querySelector('[data-holder]')?.textContent?.trim()).toBe('PJ');
  });

  it('cartão antigo sem vínculo mostra o aviso para vincular', () => {
    const el = render((h) => {
      h.account = { name: 'Antigo', type: 'CREDIT_CARD' };
      h.showBank = true;
    });
    expect(el.textContent).toContain('vincule a uma conta bancária');
  });

  it('nome longo é cortado e o texto completo fica no title', () => {
    const long = 'Conta corrente de uma empresa com um nome muito, muito comprido mesmo';
    const el = render((h) => (h.account = { name: long, type: 'CHECKING', holderType: 'PJ' }));
    const name = el.querySelector('[data-name]') as HTMLElement;
    expect(name.className).toContain('truncate');
    expect(name.getAttribute('title')).toBe(long);
  });

  describe('cor personalizada', () => {
    const tile = (el: HTMLElement) => el.querySelector('.gef-account-tile') as HTMLElement;

    it('com colorHex o tile é preenchido com a cor e o ícone usa a cor de contraste', () => {
      const dark = tile(render((h) => (h.account = { ...pf, colorHex: '#2563EB' })));
      expect(dark.style.backgroundColor).toBe('rgb(37, 99, 235)');
      expect(dark.style.color).toBe('rgb(255, 255, 255)');
      const light = tile(render((h) => (h.account = { ...pf, colorHex: '#EA580C' })));
      expect(light.style.backgroundColor).toBe('rgb(234, 88, 12)');
      expect(light.style.color).toBe('rgb(9, 13, 22)');
    });

    it('com cor não aplica o tom do tipo e mantém o nome em texto e o ícone decorativo', () => {
      const el = render((h) => (h.account = { ...card, colorHex: '#16A34A' }));
      const t = tile(el);
      expect(t.className).not.toMatch(/text-gefinc-/);
      expect(t.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(el.textContent).toContain('Nubank Roxinho');
    });

    it('aceita minúsculas e normaliza para a mesma cor', () => {
      expect(tile(render((h) => (h.account = { ...pf, colorHex: '#2563eb' }))).dataset['color']).toBe('#2563EB');
    });

    it.each([
      ['cartão', card, 'text-gefinc-accent'],
      ['dinheiro', { name: 'Carteira', type: 'CASH' }, 'text-gefinc-warning'],
      ['conta PJ', pj, 'text-gefinc-secondary'],
      ['conta PF', pf, 'text-gefinc-primary'],
    ])('sem cor (%s) mantém o visual padrão por tipo/titular', (_name, account, tone) => {
      const t = tile(render((h) => (h.account = account)));
      expect(t.classList.contains(tone)).toBe(true);
      expect(t.style.backgroundColor).toBe('');
    });

    it('colorHex nulo, vazio ou malformado (cópia local antiga) cai no visual padrão sem quebrar', () => {
      for (const colorHex of [undefined, null, '', 'azul', '#12345']) {
        const t = tile(render((h) => (h.account = { ...pf, colorHex })));
        expect(t.classList.contains('text-gefinc-primary')).toBe(true);
        expect(t.style.backgroundColor).toBe('');
      }
    });
  });
});
