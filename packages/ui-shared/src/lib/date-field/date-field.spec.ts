import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { todayIso } from '@gefinc/utils';
import { DateField } from './date-field';

@Component({
  imports: [DateField, ReactiveFormsModule],
  template: `
    <gef-date-field label="Data da compra" [min]="min()" [max]="max()" describedBy="dica" [formControl]="control" />
    <p id="dica">Dica externa</p>
  `,
})
class ReactiveHost {
  min = signal<string | null>(null);
  max = signal<string | null>(null);
  control = new FormControl<string>('2026-11-05', { nonNullable: true, validators: [Validators.required] });
}

@Component({
  imports: [DateField, FormsModule],
  template: `<gef-date-field label="Data do pagamento" [ngModel]="value()" (ngModelChange)="value.set($event)" />`,
})
class ModelHost {
  value = signal('2026-12-10');
}

function typeInto(input: HTMLInputElement, text: string) {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function key(target: Element, name: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('gef-date-field', () => {
  async function render(setup: (host: ReactiveHost) => void = () => undefined) {
    const fixture = TestBed.createComponent(ReactiveHost);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = () => el.querySelector('input') as HTMLInputElement;
    const calendarButton = () => el.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
    const days = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="grid"] button[data-day]'));
    const day = (iso: string) => document.querySelector<HTMLButtonElement>(`[role="grid"] button[data-day="${iso}"]`)!;
    const flush = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const openCalendar = async () => {
      calendarButton().focus();
      calendarButton().click();
      await flush();
    };
    return { fixture, host: fixture.componentInstance, el, input, calendarButton, days, day, flush, openCalendar };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('campo de texto com máscara', () => {
    it('é um campo de texto numérico (nunca type="date"), ligado ao rótulo, com o valor em dd/mm/aaaa', async () => {
      const { el, input } = await render();
      expect(input().type).toBe('text');
      expect(input().getAttribute('inputmode')).toBe('numeric');
      expect(input().getAttribute('autocomplete')).toBe('off');
      expect(input().placeholder).toBe('dd/mm/aaaa');
      expect(input().value).toBe('05/11/2026');
      expect(el.querySelector('label')?.textContent).toContain('Data da compra');
      expect(el.querySelector('label')?.getAttribute('for')).toBe(input().id);
      expect(el.querySelector('input[type="date"]')).toBeNull();
    });

    it('aplica a máscara enquanto digita e só aceita dígitos', async () => {
      const { input, host } = await render((h) => h.control.setValue(''));
      typeInto(input(), '0');
      expect(input().value).toBe('0');
      typeInto(input(), '051');
      expect(input().value).toBe('05/1');
      typeInto(input(), '0511');
      expect(input().value).toBe('05/11');
      typeInto(input(), '05/11/20');
      expect(input().value).toBe('05/11/20');
      typeInto(input(), '05a11b2026xx99');
      expect(input().value).toBe('05/11/2026');
      expect(host.control.value).toBe('2026-11-05');
    });

    it('data ISO colada (2026-11-05, com ou sem hora) é convertida para dd/mm/aaaa em vez de virar máscara inválida', async () => {
      const { input, host } = await render((h) => h.control.setValue(''));
      typeInto(input(), '2026-11-05');
      expect(input().value).toBe('05/11/2026');
      expect(input().selectionStart).toBe(10);
      expect(host.control.value).toBe('2026-11-05');
      expect(host.control.errors).toBeNull();

      typeInto(input(), '');
      typeInto(input(), '2026-12-31T10:30:00');
      expect(input().value).toBe('31/12/2026');
      expect(host.control.value).toBe('2026-12-31');
    });

    it('dd/mm/aaaa colado é aceito, inclusive com dia ou mês de um dígito e outros separadores', async () => {
      const { input, host } = await render((h) => h.control.setValue(''));
      typeInto(input(), '05/11/2026');
      expect(input().value).toBe('05/11/2026');
      expect(host.control.value).toBe('2026-11-05');

      typeInto(input(), '');
      typeInto(input(), '5/1/2027');
      expect(input().value).toBe('05/01/2027');
      expect(host.control.value).toBe('2027-01-05');

      typeInto(input(), '');
      typeInto(input(), '  15.03.2027 ');
      expect(input().value).toBe('15/03/2027');
      expect(host.control.value).toBe('2027-03-15');
    });

    it('data colada inexistente continua inválida e com aviso (2026-02-31)', async () => {
      const { el, input, host, flush } = await render((h) => h.control.setValue(''));
      typeInto(input(), '2026-02-31');
      await flush();
      expect(input().value).toBe('31/02/2026');
      expect(host.control.value).toBe('');
      expect(host.control.hasError('date')).toBe(true);
      expect(el.querySelector('.gef-field-error')?.textContent).toContain('dd/mm/aaaa');
    });

    it('enquanto a data está incompleta o valor do formulário fica vazio e o controle inválido', async () => {
      const { input, host } = await render();
      typeInto(input(), '0511');
      expect(host.control.value).toBe('');
      expect(host.control.hasError('date')).toBe(true);
      typeInto(input(), '05112026');
      expect(host.control.value).toBe('2026-11-05');
      expect(host.control.errors).toBeNull();
    });

    it('apagar tudo deixa o valor vazio sem erro de data', async () => {
      const { input, host } = await render();
      typeInto(input(), '');
      expect(host.control.value).toBe('');
      expect(host.control.hasError('date')).toBe(false);
      expect(host.control.hasError('required')).toBe(true);
    });

    it('data que não existe (31/02, 29/02 fora de bissexto) é recusada com mensagem e aria-invalid', async () => {
      const { el, input, host, flush } = await render();
      typeInto(input(), '31022026');
      await flush();
      expect(host.control.value).toBe('');
      expect(host.control.hasError('date')).toBe(true);
      expect(input().getAttribute('aria-invalid')).toBe('true');
      const error = el.querySelector('.gef-field-error') as HTMLElement;
      expect(error.textContent).toContain('data válida');
      expect(input().getAttribute('aria-describedby')).toContain(error.id);

      typeInto(input(), '29022026');
      await flush();
      expect(host.control.hasError('date')).toBe(true);
    });

    it('aceita 29/02 em ano bissexto', async () => {
      const { input, host, flush } = await render();
      typeInto(input(), '29022028');
      await flush();
      expect(host.control.value).toBe('2028-02-29');
      expect(input().getAttribute('aria-invalid')).toBeNull();
    });

    it('data incompleta só reclama depois que o campo perde o foco', async () => {
      const { el, input, flush } = await render();
      typeInto(input(), '0511');
      await flush();
      expect(el.querySelector('.gef-field-error')).toBeNull();
      input().dispatchEvent(new Event('blur'));
      await flush();
      expect(el.querySelector('.gef-field-error')?.textContent).toContain('dd/mm/aaaa');
    });

    it('perder o foco marca o controle como tocado', async () => {
      const { input, host } = await render();
      expect(host.control.touched).toBe(false);
      input().dispatchEvent(new Event('blur'));
      expect(host.control.touched).toBe(true);
    });

    it('o texto de apoio externo e o erro entram em aria-describedby', async () => {
      const { input, flush } = await render();
      expect(input().getAttribute('aria-describedby')).toBe('dica');
      typeInto(input(), '31022026');
      await flush();
      expect(input().getAttribute('aria-describedby')).toMatch(/^dica gef-date-field-\d+-error$/);
    });

    it('setValue de fora reescreve o texto; valor vazio ou inválido limpa', async () => {
      const { input, host, flush } = await render();
      host.control.setValue('2027-01-31');
      await flush();
      expect(input().value).toBe('31/01/2027');
      host.control.setValue('');
      await flush();
      expect(input().value).toBe('');
      host.control.setValue('lixo');
      await flush();
      expect(input().value).toBe('');
    });

    it('é um bloco (o host de componente Angular é inline por padrão)', async () => {
      const { el } = await render();
      expect(el.querySelector('gef-date-field')?.classList.contains('block')).toBe(true);
    });
  });

  describe('mínimo e máximo (props do componente, sem atributos HTML no campo)', () => {
    it('o campo de texto não leva min nem max', async () => {
      const { input } = await render((h) => {
        h.min.set('2026-01-01');
        h.max.set('2026-12-31');
      });
      expect(input().hasAttribute('min')).toBe(false);
      expect(input().hasAttribute('max')).toBe(false);
    });

    it('data fora do período é recusada com mensagem e valor vazio', async () => {
      const { el, input, host, flush } = await render((h) => {
        h.min.set('2026-11-01');
        h.max.set('2026-11-30');
      });
      typeInto(input(), '01122026');
      await flush();
      expect(host.control.value).toBe('');
      expect(host.control.hasError('date')).toBe(true);
      expect(el.querySelector('.gef-field-error')?.textContent).toContain('01/11/2026');
      expect(el.querySelector('.gef-field-error')?.textContent).toContain('30/11/2026');
      typeInto(input(), '15112026');
      await flush();
      expect(host.control.value).toBe('2026-11-15');
      expect(host.control.errors).toBeNull();
    });
  });

  describe('desabilitado', () => {
    it('desabilita o campo e o botão do calendário, e o calendário não abre', async () => {
      const { host, input, calendarButton, flush } = await render();
      host.control.disable();
      await flush();
      expect(input().disabled).toBe(true);
      expect(calendarButton().disabled).toBe(true);
      calendarButton().click();
      await flush();
      expect(document.querySelector('[role="grid"]')).toBeNull();
      host.control.enable();
      await flush();
      expect(input().disabled).toBe(false);
    });
  });

  describe('calendário', () => {
    it('o botão abre um painel modal com a grade do mês do valor atual', async () => {
      const { calendarButton, openCalendar, days } = await render();
      expect(calendarButton().getAttribute('aria-expanded')).toBe('false');
      expect(calendarButton().getAttribute('aria-label')).toBe('Abrir calendário');
      await openCalendar();
      expect(calendarButton().getAttribute('aria-expanded')).toBe('true');
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      const grid = document.querySelector('[role="grid"]') as HTMLElement;
      expect(grid.getAttribute('aria-label')).toBe('novembro de 2026');
      expect(dialog.textContent).toContain('novembro de 2026');
      expect(days()).toHaveLength(30);
      expect(Array.from(document.querySelectorAll('[role="columnheader"]')).map((h) => h.getAttribute('aria-label'))).toEqual([
        'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado',
      ]);
    });

    it('cada dia tem nome acessível completo; o escolhido é marcado e o foco vai para ele', async () => {
      const { openCalendar, day } = await render();
      await openCalendar();
      expect(day('2026-11-05').getAttribute('aria-label')).toBe('5 de novembro de 2026');
      expect(day('2026-11-05').closest('[role="gridcell"]')?.getAttribute('aria-selected')).toBe('true');
      expect(day('2026-11-06').closest('[role="gridcell"]')?.getAttribute('aria-selected')).toBe('false');
      expect(document.activeElement).toBe(day('2026-11-05'));
      expect(day('2026-11-05').tabIndex).toBe(0);
      expect(day('2026-11-06').tabIndex).toBe(-1);
    });

    it('sem valor, abre no mês de hoje com hoje marcado e focado', async () => {
      const { openCalendar, day } = await render((h) => h.control.setValue(''));
      await openCalendar();
      const today = todayIso();
      expect(day(today)).toBeTruthy();
      expect(day(today).getAttribute('aria-current')).toBe('date');
      expect(document.activeElement).toBe(day(today));
    });

    it('escolher um dia grava o valor, atualiza o texto, fecha e devolve o foco ao botão', async () => {
      const { host, input, calendarButton, openCalendar, day, flush } = await render();
      await openCalendar();
      day('2026-11-20').click();
      await flush();
      expect(host.control.value).toBe('2026-11-20');
      expect(host.control.dirty).toBe(true);
      expect(input().value).toBe('20/11/2026');
      expect(document.querySelector('[role="grid"]')).toBeNull();
      expect(document.activeElement).toBe(calendarButton());
    });

    it('mês anterior e próximo trocam a grade (virada de ano incluída)', async () => {
      const { openCalendar, days, flush } = await render();
      await openCalendar();
      const next = document.querySelector('button[aria-label="Próximo mês"]') as HTMLButtonElement;
      const prev = document.querySelector('button[aria-label="Mês anterior"]') as HTMLButtonElement;
      next.click();
      await flush();
      expect(document.querySelector('[role="grid"]')?.getAttribute('aria-label')).toBe('dezembro de 2026');
      expect(days()).toHaveLength(31);
      next.click();
      await flush();
      expect(document.querySelector('[role="grid"]')?.getAttribute('aria-label')).toBe('janeiro de 2027');
      prev.click();
      prev.click();
      prev.click();
      await flush();
      expect(document.querySelector('[role="grid"]')?.getAttribute('aria-label')).toBe('outubro de 2026');
    });

    it('setas movem o foco entre os dias (dia e semana) e viram o mês quando preciso', async () => {
      const { openCalendar, day, flush } = await render();
      await openCalendar();
      key(day('2026-11-05'), 'ArrowRight');
      await flush();
      expect(document.activeElement).toBe(day('2026-11-06'));
      key(document.activeElement!, 'ArrowDown');
      await flush();
      expect(document.activeElement).toBe(day('2026-11-13'));
      key(document.activeElement!, 'ArrowLeft');
      await flush();
      expect(document.activeElement).toBe(day('2026-11-12'));
      key(document.activeElement!, 'ArrowUp');
      await flush();
      expect(document.activeElement).toBe(day('2026-11-05'));
    });

    it('seta além do fim do mês abre o mês seguinte com o foco no dia certo', async () => {
      const { openCalendar, day, flush } = await render((h) => h.control.setValue('2026-11-30'));
      await openCalendar();
      key(day('2026-11-30'), 'ArrowRight');
      await flush();
      expect(document.querySelector('[role="grid"]')?.getAttribute('aria-label')).toBe('dezembro de 2026');
      expect(document.activeElement).toBe(day('2026-12-01'));
    });

    it('Home e End vão ao começo e ao fim da semana; PageUp e PageDown trocam o mês', async () => {
      const { openCalendar, day, flush } = await render(); // 05/11/2026 é quinta
      await openCalendar();
      key(day('2026-11-05'), 'Home');
      await flush();
      expect(document.activeElement).toBe(day('2026-11-01'));
      key(document.activeElement!, 'End');
      await flush();
      expect(document.activeElement).toBe(day('2026-11-07'));
      key(document.activeElement!, 'PageDown');
      await flush();
      expect(document.activeElement).toBe(day('2026-12-07'));
      key(document.activeElement!, 'PageUp');
      await flush();
      key(document.activeElement!, 'PageUp');
      await flush();
      expect(document.activeElement).toBe(day('2026-10-07'));
    });

    it('Escape fecha sem alterar o valor', async () => {
      const { host, calendarButton, openCalendar, day, flush } = await render();
      await openCalendar();
      key(day('2026-11-05'), 'Escape');
      await flush();
      expect(document.querySelector('[role="grid"]')).toBeNull();
      expect(host.control.value).toBe('2026-11-05');
      expect(document.activeElement).toBe(calendarButton());
    });

    it('o botão Hoje escolhe a data de hoje e fecha', async () => {
      const { host, input, openCalendar, flush } = await render();
      await openCalendar();
      const today = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Hoje') as HTMLButtonElement;
      today.click();
      await flush();
      expect(host.control.value).toBe(todayIso());
      expect(input().value).toBe(todayIso().split('-').reverse().join('/'));
      expect(document.querySelector('[role="grid"]')).toBeNull();
    });

    it('com mínimo e máximo, dias fora do período ficam desabilitados e não podem ser escolhidos', async () => {
      const { host, openCalendar, day, flush } = await render((h) => {
        h.min.set('2026-11-03');
        h.max.set('2026-11-25');
      });
      await openCalendar();
      expect(day('2026-11-02').disabled).toBe(true);
      expect(day('2026-11-03').disabled).toBe(false);
      expect(day('2026-11-25').disabled).toBe(false);
      expect(day('2026-11-26').disabled).toBe(true);
      day('2026-11-26').click();
      await flush();
      expect(host.control.value).toBe('2026-11-05');
      expect(document.querySelector('[role="grid"]')).not.toBeNull();
    });

    it('Hoje fora do período permitido fica desabilitado', async () => {
      const { openCalendar } = await render((h) => h.max.set('2000-01-01'));
      await openCalendar();
      const today = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Hoje') as HTMLButtonElement;
      expect(today.disabled).toBe(true);
    });

    it('dia de hoje tem marca além da cor e o escolhido tem marca de seleção', async () => {
      const { openCalendar, day } = await render((h) => h.control.setValue(todayIso()));
      await openCalendar();
      expect(day(todayIso()).getAttribute('aria-current')).toBe('date');
      expect(day(todayIso()).closest('[role="gridcell"]')?.getAttribute('aria-selected')).toBe('true');
    });

    it('a escolha de dia não usa controle nativo', async () => {
      const { el, openCalendar } = await render();
      await openCalendar();
      expect(el.querySelector('input[type="date"], input[type="month"], select')).toBeNull();
      expect(document.querySelector('input[type="date"], select')).toBeNull();
    });

    it('o botão Voltar do sistema fecha o calendário', async () => {
      const { openCalendar, flush } = await render();
      await openCalendar();
      const { closeTopSheet } = await import('../layout/sheet');
      expect(closeTopSheet()).toBe(true);
      await flush();
      expect(document.querySelector('[role="grid"]')).toBeNull();
    });
  });

  describe('ngModel', () => {
    it('valor inicial, digitação e escolha no calendário chegam ao modelo', async () => {
      const fixture = TestBed.createComponent(ModelHost);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const input = el.querySelector('input') as HTMLInputElement;
      expect(input.value).toBe('10/12/2026');

      typeInto(input, '01012027');
      expect(fixture.componentInstance.value()).toBe('2027-01-01');
      // o eco do modelo não apaga o texto que o usuário está digitando
      typeInto(input, '0201');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(input.value).toBe('02/01');
      expect(fixture.componentInstance.value()).toBe('');

      (el.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      (document.querySelector('[role="grid"] button[data-day]') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.componentInstance.value()).toMatch(/^\d{4}-\d{2}-01$/);
    });
  });
});
