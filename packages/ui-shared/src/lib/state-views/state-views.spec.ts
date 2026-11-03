import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ICON_SET } from '../icons/icon-set';
import { EmptyView, ErrorView, LoadingView } from './state-views';

@Component({
  imports: [LoadingView, EmptyView, ErrorView],
  template: `
    <gef-loading />
    <gef-empty title="Nenhum lançamento" hint="Cadastre o primeiro lançamento do mês.">
      <button id="acao">Novo lançamento</button>
    </gef-empty>
    <gef-error message="Falha ao carregar" (retry)="retried = retried + 1" />
  `,
})
class Host {
  retried = 0;
}

describe('state views', () => {
  it('mostra carregamento, vazio com ação e erro com nova tentativa', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[role="status"]')?.textContent).toContain('Carregando');
    expect(el.textContent).toContain('Nenhum lançamento');
    expect(el.textContent).toContain('Cadastre o primeiro lançamento do mês.');
    expect(el.querySelector('#acao')).not.toBeNull();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Falha ao carregar');

    (el.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    expect(fixture.componentInstance.retried).toBe(1);
  });

  it('vazio e erro mostram ícone decorativo; o ícone do vazio pode ser trocado', async () => {
    @Component({
      imports: [EmptyView, ErrorView, LoadingView],
      template: `
        <gef-empty title="Sem contas" icon="accounts" />
        <gef-empty title="Sem nada" />
        <gef-error message="Falhou" />
        <gef-loading message="Carregando contas…" />
      `,
    })
    class IconHost {}
    const fixture = TestBed.createComponent(IconHost);
    fixture.detectChanges();
    const empties = fixture.nativeElement.querySelectorAll('gef-empty') as NodeListOf<HTMLElement>;
    expect(empties[0].querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(empties[0].querySelector('svg path')?.getAttribute('d')).toContain('M3 7h15');
    expect(empties[1].querySelector('svg path')?.getAttribute('d')).toContain('M3 13l3-8'); // inbox padrão
    expect(fixture.nativeElement.querySelector('gef-error svg')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('gef-loading')?.textContent).toContain('Carregando contas…');
  });

  it('o erro "offline" tem ícone de sem conexão, título "Sem conexão", a mensagem e "Tentar novamente"', async () => {
    @Component({
      imports: [ErrorView],
      template: `<gef-error variant="offline" message="Sem dados salvos." (retry)="retried = retried + 1" />`,
    })
    class OfflineHost {
      retried = 0;
    }
    const fixture = TestBed.createComponent(OfflineHost);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const view = el.querySelector('[data-variant="offline"]') as HTMLElement;

    expect(view.getAttribute('role')).toBe('alert');
    expect(view.textContent).toContain('Sem conexão');
    expect(view.textContent).toContain('Sem dados salvos.');
    expect(view.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(view.querySelector('svg path')?.getAttribute('d')).toBe(ICON_SET['wifi-off'][0].d);
    expect(view.querySelector('.text-gefinc-danger')).toBeNull();
    (view.querySelector('button') as HTMLButtonElement).click();
    expect(fixture.componentInstance.retried).toBe(1);
  });

  it('o erro comum não ganha o título de falta de conexão', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const view = (fixture.nativeElement as HTMLElement).querySelector('gef-error [data-variant="error"]');
    expect(view?.textContent).not.toContain('Sem conexão');
  });
});
