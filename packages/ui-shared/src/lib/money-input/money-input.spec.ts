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

@Component({
  imports: [MoneyInput, ReactiveFormsModule],
  template: `<gef-money-input label="Valor" [autofocus]="true" [formControl]="control" />`,
})
class AutofocusHost {
  control = new FormControl<string | null>(null);
}

describe('MoneyInput autofocus', () => {
  it('foca o campo ao abrir quando solicitado', async () => {
    const fixture = TestBed.createComponent(AutofocusHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input'));
    fixture.nativeElement.remove();
  });
});

@Component({
  imports: [MoneyInput, ReactiveFormsModule],
  template: `<gef-money-input label="Valor" size="hero" tone="income" [formControl]="control" />`,
})
class HeroHost {
  control = new FormControl<string | null>(null);
}

describe('MoneyInput hero e tom', () => {
  it('no tamanho hero o valor é grande, centralizado e colorido só no texto', async () => {
    const fixture = TestBed.createComponent(HeroHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const field = el.querySelector('.gef-money-field') as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;

    expect(field.getAttribute('data-size')).toBe('hero');
    expect(input.className).toContain('text-display-1');
    expect(input.className).toContain('text-center');
    expect(input.className).toContain('text-gefinc-primary');
    expect(field.className).not.toContain('text-gefinc');
  });

  it('o campo comum usa a classe de foco neutro e nunca o foco verde', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.gef-money-field')).not.toBeNull();
    expect(el.innerHTML).not.toContain('focus-within:border-gefinc-primary');
    expect((el.querySelector('input') as HTMLInputElement).className).toContain('text-right');
  });
});
