import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { CategoryType } from '@gefinc/core-models';
import { KindSwitch } from './kind-switch';

@Component({
  imports: [KindSwitch, ReactiveFormsModule],
  template: `<gef-kind-switch [formControl]="control" />`,
})
class Host {
  control = new FormControl<CategoryType>('EXPENSE', { nonNullable: true });
}

describe('KindSwitch', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, control: fixture.componentInstance.control };
  }

  it('mostra Despesa e Receita com ícone, com Despesa marcada por padrão', async () => {
    const { el } = await setup();
    const labels = Array.from(el.querySelectorAll('[data-field="kind"] label'));
    expect(labels.map((l) => l.textContent?.trim())).toEqual(['Despesa', 'Receita']);
    expect(labels.every((l) => l.querySelector('svg') !== null)).toBe(true);
    expect((el.querySelector('#kind-EXPENSE') as HTMLInputElement).checked).toBe(true);
    expect((el.querySelector('#kind-INCOME') as HTMLInputElement).checked).toBe(false);
  });

  it('escolher Receita atualiza o controle e marca o rádio', async () => {
    const { fixture, el, control } = await setup();

    (el.querySelector('#kind-INCOME') as HTMLInputElement).click();
    fixture.detectChanges();

    expect(control.value).toBe('INCOME');
    expect((el.querySelector('#kind-INCOME') as HTMLInputElement).checked).toBe(true);
  });

  it('informa se a escolha veio de toque ou de teclado', async () => {
    const { fixture, el } = await setup();
    const sources: string[] = [];
    fixture.debugElement.children[0].componentInstance.picked.subscribe((s: string) => sources.push(s));
    const group = el.querySelector('[data-field="kind"]') as HTMLElement;

    group.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    (el.querySelector('#kind-INCOME') as HTMLInputElement).click();
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    (el.querySelector('#kind-EXPENSE') as HTMLInputElement).click();
    (el.querySelector('#kind-INCOME') as HTMLInputElement).click();

    expect(sources).toEqual(['pointer', 'keyboard', 'keyboard']);
  });

  it('acompanha o valor definido pelo formulário', async () => {
    const { fixture, el, control } = await setup();

    control.setValue('INCOME');
    fixture.detectChanges();

    expect((el.querySelector('#kind-INCOME') as HTMLInputElement).checked).toBe(true);
    expect((el.querySelector('#kind-EXPENSE') as HTMLInputElement).checked).toBe(false);
  });

  it('desabilita os dois rádios junto com o controle', async () => {
    const { fixture, el, control } = await setup();

    control.disable();
    fixture.detectChanges();

    expect((el.querySelector('#kind-EXPENSE') as HTMLInputElement).disabled).toBe(true);
    expect((el.querySelector('#kind-INCOME') as HTMLInputElement).disabled).toBe(true);
  });
});
