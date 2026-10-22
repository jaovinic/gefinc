import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Sheet } from './sheet';

@Component({
  imports: [Sheet],
  template: `
    <button id="outside" type="button">fora</button>
    <gef-sheet heading="Filtros" [side]="side()" [open]="open()" (closed)="closed()">
      <input id="first" />
      <button id="last" type="button">Aplicar</button>
    </gef-sheet>
  `,
})
class Host {
  readonly open = signal(false);
  readonly side = signal<'bottom' | 'left'>('bottom');
  readonly closed = jest.fn(() => this.open.set(false));
}

describe('Sheet (painel inferior)', () => {
  function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, host: fixture.componentInstance, el };
  }
  async function open(fixture: ReturnType<typeof setup>['fixture']) {
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('não renderiza nada enquanto fechado', () => {
    const { el } = setup();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('abre como diálogo modal com rótulo acessível e o conteúdo', async () => {
    const { fixture, el } = setup();
    await open(fixture);
    const dialog = el.querySelector('[role="dialog"]') as HTMLElement;

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Filtros');
    expect(dialog.querySelector('#first')).not.toBeNull();
    expect(dialog.textContent).toContain('Filtros');
  });

  it('fecha com Escape, com o botão Fechar e ao tocar no fundo, mas não ao tocar no conteúdo', async () => {
    const { fixture, host, el } = setup();

    await open(fixture);
    (el.querySelector('[role="dialog"]') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.closed).toHaveBeenCalledTimes(1);

    await open(fixture);
    (el.querySelector('button[aria-label="Fechar"]') as HTMLButtonElement).click();
    expect(host.closed).toHaveBeenCalledTimes(2);

    await open(fixture);
    (el.querySelector('#first') as HTMLElement).click();
    expect(host.closed).toHaveBeenCalledTimes(2);
    (el.querySelector('.gef-sheet-backdrop') as HTMLElement).click();
    expect(host.closed).toHaveBeenCalledTimes(3);
  });

  it('leva o foco para o primeiro campo ao abrir e mantém o Tab dentro do painel', async () => {
    const { fixture, el } = setup();
    await open(fixture);
    const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
    const first = el.querySelector('#first') as HTMLElement;
    const last = el.querySelector('#last') as HTMLElement;
    const close = el.querySelector('button[aria-label="Fechar"]') as HTMLElement;

    expect(document.activeElement).toBe(close);

    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    close.focus();
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    close.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    expect(dialog.contains(first)).toBe(true);
  });

  it('devolve o foco ao elemento que o abriu ao fechar', async () => {
    const { fixture, el } = setup();
    const outside = el.querySelector('#outside') as HTMLElement;
    outside.focus();
    await open(fixture);

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(outside);
  });

  it('Escape fecha mesmo com o foco fora do painel', async () => {
    const { fixture, host, el } = setup();
    await open(fixture);
    (el.querySelector('#outside') as HTMLElement).focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.closed).toHaveBeenCalledTimes(1);
  });

  it('Escape sem painel aberto não faz nada', () => {
    const { host } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.closed).not.toHaveBeenCalled();
  });

  it('como gaveta lateral abre colada à esquerda e continua sendo um diálogo modal', async () => {
    const { fixture, host, el } = setup();
    host.side.set('left');
    await open(fixture);
    const dialog = el.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.classList.contains('gef-sheet-left')).toBe(true);
    expect(el.querySelector('.gef-sheet-backdrop')?.classList.contains('gef-sheet-backdrop-left')).toBe(true);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('o painel padrão continua subindo da base', async () => {
    const { fixture, el } = setup();
    await open(fixture);
    expect((el.querySelector('[role="dialog"]') as HTMLElement).classList.contains('gef-sheet-left')).toBe(false);
  });
});

@Component({
  imports: [Sheet],
  template: `
    <gef-sheet heading="Fora" [open]="outer()" (closed)="outerClosed()">
      <input id="outer-field" />
      <gef-sheet heading="Dentro" [open]="inner()" (closed)="innerClosed()">
        <input id="inner-field" />
      </gef-sheet>
    </gef-sheet>
  `,
})
class NestedHost {
  readonly outer = signal(true);
  readonly inner = signal(true);
  readonly outerClosed = jest.fn();
  readonly innerClosed = jest.fn();
}

describe('Sheet aninhado (painel dentro de painel)', () => {
  async function setup() {
    const fixture = TestBed.createComponent(NestedHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance };
  }

  it('Escape fecha só o painel de cima', async () => {
    const { host } = await setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.innerClosed).toHaveBeenCalledTimes(1);
    expect(host.outerClosed).not.toHaveBeenCalled();
  });

  it('depois que o de dentro fecha, Escape fecha o de fora', async () => {
    const { fixture, host } = await setup();
    host.inner.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.outerClosed).toHaveBeenCalledTimes(1);
  });

  it('o foco abre no painel de dentro e Tab fica nele', async () => {
    const { fixture } = await setup();
    const inner = fixture.nativeElement.querySelector('#inner-field') as HTMLElement;
    const close = Array.from(fixture.nativeElement.querySelectorAll('button[aria-label="Fechar"]')).pop() as HTMLElement;
    expect(document.activeElement).toBe(close);
    inner.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    inner.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
  });
});
