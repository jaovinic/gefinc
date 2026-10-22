import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ACCOUNT_ICONS } from '@gefinc/core-models';
import { IconPicker } from './icon-picker';

@Component({
  imports: [IconPicker, ReactiveFormsModule],
  template: `<gef-icon-picker label="Ícone" [formControl]="control" />`,
})
class Host {
  control = new FormControl<string | null>(null);
}

describe('gef-icon-picker', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const options = () => Array.from(el.querySelectorAll<HTMLElement>('[role="radio"]'));
    return { fixture, host: fixture.componentInstance, el, options };
  }

  it('mostra todos os ícones do catálogo como grupo de opções rotuladas', () => {
    const { el, options } = render();
    expect(el.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Ícone');
    expect(options().length).toBe(ACCOUNT_ICONS.length);
    expect(options().every((o) => !!o.getAttribute('aria-label'))).toBe(true);
  });

  it('escolher um ícone atualiza o formulário e marca a opção', () => {
    const { fixture, host, options } = render();
    options()[3].click();
    fixture.detectChanges();
    expect(host.control.value).toBe(ACCOUNT_ICONS[3]);
    expect(options()[3].getAttribute('aria-checked')).toBe('true');
    expect(options()[0].getAttribute('aria-checked')).toBe('false');
  });

  it('o valor inicial vem marcado', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.control.setValue('rocket');
    fixture.detectChanges();
    const checked = (fixture.nativeElement as HTMLElement).querySelector('[aria-checked="true"]');
    expect(checked?.getAttribute('data-icon')).toBe('rocket');
  });

  it('setas e Enter escolhem pelo teclado', () => {
    const { fixture, host, options } = render();
    options()[0].focus();
    options()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(host.control.value).toBe(ACCOUNT_ICONS[1]);
    options()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(host.control.value).toBe(ACCOUNT_ICONS[2]);
    options()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(host.control.value).toBe(ACCOUNT_ICONS[1]);
  });

  it('desabilitado não aceita escolha', () => {
    const { fixture, host, options } = render();
    host.control.disable();
    fixture.detectChanges();
    options()[2].click();
    fixture.detectChanges();
    expect(host.control.value).toBeNull();
  });
});
