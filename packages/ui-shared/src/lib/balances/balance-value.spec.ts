import { TestBed } from '@angular/core/testing';
import { BalanceValue } from './balance-value';

describe('BalanceValue', () => {
  function render(value: string) {
    const fixture = TestBed.createComponent(BalanceValue);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.financial-value') as HTMLElement;
  }

  it('positivo é verde, com seta para cima e texto para leitor de tela', () => {
    const el = render('1500.00');
    expect(el.textContent).toContain('R$ 1.500,00');
    expect(el.className).toContain('text-gefinc-primary');
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.textContent).toContain('Saldo positivo');
  });

  it('negativo é vermelho, com sinal de menos, seta para baixo e texto para leitor de tela', () => {
    const el = render('-200.00');
    expect(el.textContent).toContain('-R$ 200,00');
    expect(el.className).toContain('text-gefinc-danger');
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.textContent).toContain('Saldo negativo');
  });

  it('zero é neutro, sem ícone', () => {
    const el = render('0.00');
    expect(el.textContent).toContain('R$ 0,00');
    expect(el.className).not.toContain('text-gefinc-primary');
    expect(el.className).not.toContain('text-gefinc-danger');
    expect(el.querySelector('svg')).toBeNull();
  });
});
