import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
});
