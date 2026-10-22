import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MoneyInput } from './money-input';

@Component({
  imports: [MoneyInput, ReactiveFormsModule],
  template: `<gef-money-input label="Valor" [formControl]="control" />`,
})
class Host {
  control = new FormControl<string | null>(null);
}

function type(input: HTMLInputElement, text: string) {
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

describe('MoneyInput', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    return { fixture, input, control: fixture.componentInstance.control };
  }

  it('preenche os centavos enquanto o usuário digita algarismos', async () => {
    const { input, control } = await setup();

    type(input, '1');
    expect(input.value).toBe('0,01');
    expect(control.value).toBe('0.01');

    type(input, '0,011');
    expect(input.value).toBe('0,11');

    type(input, '123456');
    expect(input.value).toBe('1.234,56');
    expect(control.value).toBe('1234.56');
  });

  it('ignora letras e símbolos', async () => {
    const { input, control } = await setup();

    type(input, 'R$ 12a,3b4');

    expect(control.value).toBe('12.34');
  });

  it('volta a null quando o campo é esvaziado', async () => {
    const { input, control } = await setup();
    type(input, '500');

    type(input, '');

    expect(control.value).toBeNull();
    expect(input.value).toBe('');
  });

  it('mostra o valor vindo do formulário', async () => {
    const { fixture, input, control } = await setup();

    control.setValue('2500.90');
    fixture.detectChanges();

    expect(input.value).toBe('2.500,90');
  });

  it('desabilita o campo junto com o controle', async () => {
    const { fixture, input, control } = await setup();

    control.disable();
    fixture.detectChanges();

    expect(input.disabled).toBe(true);
  });
});
