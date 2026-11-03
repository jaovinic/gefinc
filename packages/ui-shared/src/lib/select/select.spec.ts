import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Select, type SelectOption } from './select';

const CATEGORIES: SelectOption[] = [
  { value: 10, label: 'Alimentação' },
  { value: 11, label: 'Lazer' },
  { value: 12, label: 'Saúde' },
  { value: 13, label: 'Educação', disabled: true },
  { value: 14, label: 'Transporte' },
];

@Component({
  imports: [Select, ReactiveFormsModule],
  template: `
    <gef-select label="Categoria" placeholder="Selecione…" emptyMessage="Nenhuma categoria." [options]="options()" [formControl]="control" />
  `,
})
class ReactiveHost {
  options = signal<SelectOption[]>(CATEGORIES);
  control = new FormControl<number | null>(null);
}

@Component({
  imports: [Select, FormsModule],
  template: `
    <gef-select ariaLabel="Status" [options]="options" [ngModel]="value()" (ngModelChange)="value.set($event)" />
  `,
})
class ModelHost {
  options: SelectOption[] = [
    { value: '', label: 'Todos os status' },
    { value: 'PENDING', label: 'Pendentes' },
    { value: 'PAID', label: 'Pagos' },
  ];
  value = signal<string>('');
}

function key(target: Element, name: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('gef-select', () => {
  function render(setup: (host: ReactiveHost) => void = () => undefined) {
    const fixture = TestBed.createComponent(ReactiveHost);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = () => el.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
    const options = () => Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
    const flush = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const open = async () => {
      trigger().focus();
      trigger().click();
      await flush();
    };
    return { fixture, host: fixture.componentInstance, el, trigger, options, open, flush };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('gatilho e nome acessível', () => {
    it('sem valor mostra a orientação e o botão está ligado ao rótulo do campo', () => {
      const { trigger, el } = render();
      expect(trigger().textContent).toContain('Selecione…');
      const label = el.querySelector('label') as HTMLLabelElement;
      expect(label.textContent).toContain('Categoria');
      expect(label.getAttribute('for')).toBe(trigger().id);
      expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
      expect(trigger().type).toBe('button');
    });

    it('o nome acessível é o rótulo seguido do valor atual (aria-labelledby, que os leitores sempre leem)', async () => {
      const { trigger, el, host, flush } = render((h) => h.control.setValue(11));
      const nameOf = () =>
        (trigger().getAttribute('aria-labelledby') ?? '')
          .split(' ')
          .map((id) => el.querySelector(`#${id}`)?.textContent?.trim())
          .join(' ');
      expect(trigger().hasAttribute('aria-describedby')).toBe(false);
      expect(nameOf()).toBe('Categoria Lazer');

      host.control.setValue(12);
      await flush();
      expect(nameOf()).toBe('Categoria Saúde');
    });

    it('sem rótulo visível usa o ariaLabel (nome acessível) e não cria <label>', async () => {
      const fixture = TestBed.createComponent(ModelHost);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const trigger = el.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
      expect(el.querySelector('label')).toBeNull();
      const [labelId, valueId] = (trigger.getAttribute('aria-labelledby') ?? '').split(' ');
      expect(el.querySelector(`#${labelId}`)?.textContent?.trim()).toBe('Status');
      expect(el.querySelector(`#${valueId}`)?.textContent?.trim()).toBe('Todos os status');
      expect(trigger.hasAttribute('aria-describedby')).toBe(false);
    });

    it('mostra o rótulo da opção que corresponde ao valor inicial', () => {
      const { trigger } = render((h) => h.control.setValue(12));
      expect(trigger().textContent).toContain('Saúde');
    });

    it('valor que não está nas opções volta à orientação', () => {
      const { trigger } = render((h) => h.control.setValue(999));
      expect(trigger().textContent).toContain('Selecione…');
    });
  });

  describe('lista', () => {
    it('abre um painel modal com listbox e opções, e o gatilho passa a expandido', async () => {
      const { open, options, trigger } = render();
      await open();
      const listbox = document.querySelector('[role="listbox"]') as HTMLElement;
      expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Categoria');
      expect(listbox.getAttribute('aria-label')).toBe('Categoria');
      expect(options().map((o) => o.textContent?.trim())).toEqual(['Alimentação', 'Lazer', 'Saúde', 'Educação', 'Transporte']);
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
    });

    it('marca a opção atual com aria-selected e uma marca visível além da cor', async () => {
      const { open, options } = render((h) => h.control.setValue(12));
      await open();
      expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false', 'false']);
      expect(options()[2].querySelector('svg')).not.toBeNull();
      expect(options()[0].querySelector('svg')).toBeNull();
    });

    it('opção desabilitada fica com aria-disabled e não pode ser escolhida', async () => {
      const { fixture, host, open, options } = render();
      await open();
      expect(options()[3].getAttribute('aria-disabled')).toBe('true');
      options()[3].click();
      fixture.detectChanges();
      expect(host.control.value).toBeNull();
      expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    });

    it('sem opções mostra a mensagem de vazio', async () => {
      const { open } = render((h) => h.options.set([]));
      await open();
      expect(document.body.textContent).toContain('Nenhuma categoria.');
      expect(document.querySelector('[role="listbox"]')).toBeNull();
    });

    it('lista longa rola dentro do painel', async () => {
      const { open } = render((h) => h.options.set(Array.from({ length: 24 }, (_, i) => ({ value: i, label: `${i}h` }))));
      await open();
      const list = document.querySelector('[role="listbox"]') as HTMLElement;
      expect(list.className).toContain('overflow-y-auto');
      expect(list.querySelectorAll('[role="option"]').length).toBe(24);
    });
  });

  describe('escolha', () => {
    it('clicar numa opção grava o valor (número continua número), fecha e mostra o escolhido', async () => {
      const { host, open, options, trigger, flush } = render();
      await open();
      options()[1].click();
      await flush();
      expect(host.control.value).toBe(11);
      expect(host.control.touched).toBe(true);
      expect(host.control.dirty).toBe(true);
      expect(document.querySelector('[role="listbox"]')).toBeNull();
      expect(trigger().textContent).toContain('Lazer');
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });

    it('Enter e Espaço escolhem a opção com foco', async () => {
      const { host, open, options, flush } = render();
      await open();
      key(options()[2], 'Enter');
      await flush();
      expect(host.control.value).toBe(12);

      await open();
      const event = key(options()[0], ' ');
      await flush();
      expect(event.defaultPrevented).toBe(true);
      expect(host.control.value).toBe(10);
    });

    it('Escape fecha sem alterar o valor e devolve o foco ao gatilho', async () => {
      const { host, open, options, trigger, flush } = render((h) => h.control.setValue(11));
      await open();
      key(options()[0], 'Escape');
      await flush();
      expect(document.querySelector('[role="listbox"]')).toBeNull();
      expect(host.control.value).toBe(11);
      expect(document.activeElement).toBe(trigger());
    });

    it('tocar no fundo fecha sem escolher', async () => {
      const { host, open, flush } = render();
      await open();
      (document.querySelector('.gef-sheet-backdrop') as HTMLElement).click();
      await flush();
      expect(document.querySelector('[role="listbox"]')).toBeNull();
      expect(host.control.value).toBeNull();
    });

    it('o botão Voltar do sistema (fecha o painel do topo) fecha a lista', async () => {
      const { open, flush } = render();
      await open();
      const { closeTopSheet } = await import('../layout/sheet');
      expect(closeTopSheet()).toBe(true);
      await flush();
      expect(document.querySelector('[role="listbox"]')).toBeNull();
    });
  });

  describe('teclado', () => {
    it('o gatilho abre com seta para baixo e seta para cima', async () => {
      const { trigger, flush } = render();
      const down = key(trigger(), 'ArrowDown');
      await flush();
      expect(down.defaultPrevented).toBe(true);
      expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    });

    it('ao abrir o foco vai para a opção marcada (roving tabindex) e as outras saem da ordem de Tab', async () => {
      const { open, options } = render((h) => h.control.setValue(12));
      await open();
      expect(document.activeElement).toBe(options()[2]);
      expect(options().map((o) => o.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
    });

    it('sem valor o foco vai para a primeira opção habilitada', async () => {
      const { open, options } = render();
      await open();
      expect(document.activeElement).toBe(options()[0]);
    });

    it('setas movem o foco, pulam opção desabilitada e não passam das pontas', async () => {
      const { fixture, open, options } = render((h) => h.control.setValue(12));
      await open();
      key(options()[2], 'ArrowDown');
      expect(document.activeElement).toBe(options()[4]); // pulou "Educação" (desabilitada)
      key(options()[4], 'ArrowDown');
      expect(document.activeElement).toBe(options()[4]);
      key(options()[4], 'ArrowUp');
      expect(document.activeElement).toBe(options()[2]);
      key(options()[2], 'ArrowUp');
      key(options()[1], 'ArrowUp');
      key(options()[0], 'ArrowUp');
      expect(document.activeElement).toBe(options()[0]);
      fixture.detectChanges();
      expect(options().map((o) => o.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    });

    it('Home e End vão para a primeira e a última opção habilitadas', async () => {
      const { open, options } = render((h) => h.control.setValue(11));
      await open();
      key(options()[1], 'End');
      expect(document.activeElement).toBe(options()[4]);
      key(options()[4], 'Home');
      expect(document.activeElement).toBe(options()[0]);
    });

    it('digitar letras leva o foco à opção que começa com elas, sem acento e sem diferenciar maiúsculas', async () => {
      const { open, options } = render();
      await open();
      key(options()[0], 'S');
      key(options()[0], 'a');
      key(options()[0], 'u');
      expect(document.activeElement).toBe(options()[2]); // "sau" combina com "Saúde"
    });

    it('o buffer acumula letras seguidas e recomeça depois de uma pausa; opção desabilitada não recebe foco', async () => {
      jest.useFakeTimers();
      try {
        const { open, options } = render();
        await open();
        key(options()[0], 'l');
        expect(document.activeElement).toBe(options()[1]); // Lazer
        key(options()[1], 't'); // "lt" não existe: o foco fica
        expect(document.activeElement).toBe(options()[1]);
        jest.advanceTimersByTime(1000);
        key(options()[1], 't'); // novo buffer: "t" -> Transporte
        expect(document.activeElement).toBe(options()[4]);
        jest.advanceTimersByTime(1000);
        key(options()[4], 'e'); // "Educação" está desabilitada
        expect(document.activeElement).toBe(options()[4]);
      } finally {
        jest.useRealTimers();
      }
    });

    it('teclas com Ctrl ou Alt não disparam a busca', async () => {
      const { open, options } = render();
      await open();
      key(options()[0], 'l', { ctrlKey: true });
      expect(document.activeElement).toBe(options()[0]);
    });

    it('a seta do gatilho não escolhe nada sozinha', async () => {
      const { host, trigger, flush } = render();
      key(trigger(), 'ArrowDown');
      await flush();
      expect(host.control.value).toBeNull();
    });
  });

  describe('formulários', () => {
    it('reativo: setValue de fora atualiza o texto, e escolher atualiza o controle', async () => {
      const { host, trigger, open, options, flush } = render();
      host.control.setValue(14);
      await flush();
      expect(trigger().textContent).toContain('Transporte');
      await open();
      options()[0].click();
      await flush();
      expect(host.control.value).toBe(10);
    });

    it('reativo: o controle desabilitado desabilita o botão e não abre', async () => {
      const { host, trigger, flush } = render();
      host.control.disable();
      await flush();
      expect(trigger().disabled).toBe(true);
      trigger().click();
      await flush();
      expect(document.querySelector('[role="listbox"]')).toBeNull();
      host.control.enable();
      await flush();
      expect(trigger().disabled).toBe(false);
    });

    it('ngModel: valor inicial, escolha e valores string', async () => {
      const fixture = TestBed.createComponent(ModelHost);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const trigger = el.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
      expect(trigger.textContent).toContain('Todos os status');

      trigger.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
      expect(options[0].getAttribute('aria-selected')).toBe('true');
      options[2].click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.value()).toBe('PAID');
      expect(trigger.textContent).toContain('Pagos');
    });

    it('é um bloco (o host de componente Angular é inline por padrão)', () => {
      const { el } = render();
      expect(el.querySelector('gef-select')?.classList.contains('block')).toBe(true);
    });

    it('nunca cria um <select> nativo', async () => {
      const { el, open } = render();
      await open();
      expect(el.querySelector('select')).toBeNull();
      expect(document.querySelector('select')).toBeNull();
    });
  });
});
