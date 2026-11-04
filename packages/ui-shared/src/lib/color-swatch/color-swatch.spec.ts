import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CATEGORY_COLORS, ColorSwatch, type SwatchColor } from './color-swatch';

/** Mesma fonte das cores padrão que o api-server usa: todas precisam estar na paleta. */
const defaults: { expense: { name: string; color: string }[]; income: { name: string; color: string }[] } = JSON.parse(
  readFileSync(join(__dirname, '../../../../core-models/fixtures/default-categories.json'), 'utf8'),
);

@Component({
  imports: [ColorSwatch, ReactiveFormsModule],
  template: `<gef-color-swatch label="Cor" [formControl]="control" />`,
})
class ReactiveHost {
  control = new FormControl<string>('#94a3b8', { nonNullable: true });
}

@Component({
  imports: [ColorSwatch, FormsModule],
  template: `<gef-color-swatch label="Cor da categoria" [(ngModel)]="value" />`,
})
class ModelHost {
  value = '#16A34A';
}

const MINI_PALETTE: SwatchColor[] = [
  { hex: '#2563EB', name: 'Azul' },
  { hex: '#16A34A', name: 'Verde' },
  { hex: '#E11D48', name: 'Carmim' },
];

@Component({
  imports: [ColorSwatch, ReactiveFormsModule],
  template: `<gef-color-swatch label="Cor da conta" [formControl]="control" [palette]="palette" defaultLabel="Usar a cor padrão" />`,
})
class PaletteHost {
  palette = MINI_PALETTE;
  control = new FormControl<string | null>(null);
}

function key(target: Element, name: string) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('gef-color-swatch', () => {
  async function render(initial?: string) {
    const fixture = TestBed.createComponent(ReactiveHost);
    if (initial !== undefined) {
      fixture.componentInstance.control.setValue(initial);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const radios = () => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const checked = () => radios().filter((r) => r.getAttribute('aria-checked') === 'true');
    const flush = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, host: fixture.componentInstance, el, radios, checked, flush };
  }

  describe('paleta', () => {
    it('é um grupo de opções (radiogroup) nomeado, com um botão de opção por cor', async () => {
      const { el, radios } = await render();
      const group = el.querySelector('[role="radiogroup"]') as HTMLElement;
      expect(group.getAttribute('aria-label')).toBe('Cor');
      expect(radios().length).toBe(CATEGORY_COLORS.length);
      expect(radios().every((r) => r.type === 'button')).toBe(true);
      expect(el.querySelector('input[type="color"]')).toBeNull();
    });

    it('inclui todas as cores padrão das categorias (fonte única) e a verde de Compras', () => {
      const palette = CATEGORY_COLORS.map((c) => c.hex.toUpperCase());
      for (const category of [...defaults.expense, ...defaults.income]) {
        expect(palette).toContain(category.color.toUpperCase());
      }
      expect(palette).toContain('#16A34A');
    });

    it('toda cor é #RRGGBB (o servidor valida esse formato), sem repetição, com nome', () => {
      const hexes = CATEGORY_COLORS.map((c) => c.hex.toUpperCase());
      expect(new Set(hexes).size).toBe(hexes.length);
      for (const color of CATEGORY_COLORS) {
        expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
        expect(color.name.length).toBeGreaterThan(2);
      }
    });

    it('cada opção tem nome acessível com o nome da cor e o código', async () => {
      const { radios } = await render();
      const orange = radios().find((r) => r.dataset['color'] === '#F97316') as HTMLButtonElement;
      expect(orange.getAttribute('aria-label')).toBe('Laranja (#F97316)');
      for (const radio of radios()) {
        expect(radio.getAttribute('aria-label')).toMatch(/\(#[0-9A-F]{6}\)$/);
      }
    });

    it('a cor é mostrada como fundo da opção', async () => {
      const { radios } = await render();
      expect(radios()[0].style.backgroundColor).not.toBe('');
    });
  });

  describe('marca de selecionado', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const toHex = (rgb: string) => '#' + (rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');

    it('a marca tem contraste de pelo menos 4:1 com a cor onde aparece (o mínimo para gráficos é 3:1), em toda a paleta', async () => {
      const { radios } = await render();
      for (const radio of radios()) {
        expect(ratio(radio.dataset['color']!, toHex(radio.style.color))).toBeGreaterThanOrEqual(4);
      }
    });
  });

  describe('seleção', () => {
    it('marca a cor atual sem diferenciar maiúsculas e mostra uma marca além da cor', async () => {
      const { checked } = await render('#94a3b8');
      expect(checked()).toHaveLength(1);
      expect(checked()[0].dataset['color']).toBe('#94A3B8');
      expect(checked()[0].querySelector('svg')).not.toBeNull();
    });

    it('só a opção marcada tem a marca de selecionado', async () => {
      const { radios } = await render('#16A34A');
      expect(radios().filter((r) => r.querySelector('svg')).map((r) => r.dataset['color'])).toEqual(['#16A34A']);
    });

    it('clicar numa cor grava #RRGGBB em maiúsculas, marca e avisa o formulário', async () => {
      const { host, radios, checked, flush } = await render();
      const blue = radios().find((r) => r.dataset['color'] === '#3B82F6') as HTMLButtonElement;
      blue.click();
      await flush();
      expect(host.control.value).toBe('#3B82F6');
      expect(host.control.dirty).toBe(true);
      expect(host.control.touched).toBe(true);
      expect(checked().map((r) => r.dataset['color'])).toEqual(['#3B82F6']);
    });

    it('setValue de fora muda a marcada', async () => {
      const { host, checked, flush } = await render();
      host.control.setValue('#EC4899');
      await flush();
      expect(checked().map((r) => r.dataset['color'])).toEqual(['#EC4899']);
    });

    it('sem valor válido nenhuma opção fica marcada e a primeira entra na ordem de Tab', async () => {
      const { radios, checked } = await render('');
      expect(checked()).toHaveLength(0);
      expect(radios().map((r) => r.tabIndex)).toEqual(radios().map((_, i) => (i === 0 ? 0 : -1)));
    });
  });

  describe('cor fora da paleta ("Cor atual")', () => {
    it('mostra a cor existente como opção "Cor atual", marcada, sem perder o dado', async () => {
      const { host, radios, checked } = await render('#123ABC');
      expect(radios()).toHaveLength(CATEGORY_COLORS.length + 1);
      expect(checked()).toHaveLength(1);
      expect(checked()[0].dataset['color']).toBe('#123ABC');
      expect(checked()[0].getAttribute('aria-label')).toBe('Cor atual (#123ABC)');
      expect(host.control.value).toBe('#123ABC');
    });

    it('trocar para uma cor da paleta mantém "Cor atual" disponível para voltar', async () => {
      const { host, radios, checked, flush } = await render('#123ABC');
      radios().find((r) => r.dataset['color'] === '#F97316')!.click();
      await flush();
      expect(host.control.value).toBe('#F97316');
      const current = radios().find((r) => r.getAttribute('aria-label') === 'Cor atual (#123ABC)')!;
      expect(current).toBeTruthy();
      current.click();
      await flush();
      expect(host.control.value).toBe('#123ABC');
      expect(checked()[0].dataset['color']).toBe('#123ABC');
    });

    it('cor da paleta não cria a opção extra', async () => {
      const { radios } = await render('#F97316');
      expect(radios()).toHaveLength(CATEGORY_COLORS.length);
    });

    it('texto que não é #RRGGBB não vira opção', async () => {
      const { radios } = await render('azul');
      expect(radios()).toHaveLength(CATEGORY_COLORS.length);
    });
  });

  describe('teclado', () => {
    it('só a opção marcada entra na ordem de Tab', async () => {
      const { radios } = await render('#3B82F6');
      expect(radios().filter((r) => r.tabIndex === 0).map((r) => r.dataset['color'])).toEqual(['#3B82F6']);
    });

    it('setas movem a escolha e o foco, dando a volta nas pontas', async () => {
      const { host, radios, checked, flush } = await render('#3B82F6');
      const start = radios().findIndex((r) => r.dataset['color'] === '#3B82F6');
      key(radios()[start], 'ArrowRight');
      await flush();
      expect(checked()[0]).toBe(radios()[start + 1]);
      expect(document.activeElement).toBe(radios()[start + 1]);
      expect(host.control.value).toBe(radios()[start + 1].dataset['color']);

      key(radios()[start + 1], 'ArrowLeft');
      await flush();
      expect(checked()[0]).toBe(radios()[start]);

      host.control.setValue(radios()[0].dataset['color']!);
      await flush();
      key(radios()[0], 'ArrowUp');
      await flush();
      expect(checked()[0]).toBe(radios()[radios().length - 1]);
    });
  });

  describe('desabilitado', () => {
    it('desabilita todas as opções e ignora cliques', async () => {
      const { host, radios, flush } = await render();
      host.control.disable();
      await flush();
      expect(radios().every((r) => r.disabled)).toBe(true);
      radios()[0].click();
      expect(host.control.value).toBe('#94a3b8');
    });
  });

  describe('ngModel', () => {
    it('valor inicial e escolha chegam ao modelo', async () => {
      const fixture = TestBed.createComponent(ModelHost);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const radios = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
      expect(radios.find((r) => r.getAttribute('aria-checked') === 'true')?.dataset['color']).toBe('#16A34A');
      radios.find((r) => r.dataset['color'] === '#8B5CF6')!.click();
      expect(fixture.componentInstance.value).toBe('#8B5CF6');
    });
  });

  it('é um bloco (o host de componente Angular é inline por padrão)', async () => {
    const { el } = await render();
    expect(el.querySelector('gef-color-swatch')?.classList.contains('block')).toBe(true);
  });

  describe('paleta própria e cor padrão', () => {
    async function renderPalette(initial: string | null = null) {
      const fixture = TestBed.createComponent(PaletteHost);
      fixture.componentInstance.control.setValue(initial);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const radios = () => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
      const checked = () => radios().filter((r) => r.getAttribute('aria-checked') === 'true');
      const defaultButton = () => el.querySelector<HTMLButtonElement>('[data-default-color]');
      const flush = async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      };
      return { host: fixture.componentInstance, el, radios, checked, defaultButton, flush };
    }

    it('mostra só as cores da paleta recebida, com nome acessível e rótulo do grupo', async () => {
      const { el, radios } = await renderPalette();
      expect(el.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Cor da conta');
      expect(radios().map((r) => r.getAttribute('aria-label'))).toEqual(['Azul (#2563EB)', 'Verde (#16A34A)', 'Carmim (#E11D48)']);
      expect(radios().every((r) => r.style.backgroundColor !== '')).toBe(true);
    });

    it('sem valor nada fica marcado, o botão da cor padrão não aparece e a primeira cor entra no Tab', async () => {
      const { radios, checked, defaultButton } = await renderPalette();
      expect(checked()).toHaveLength(0);
      expect(defaultButton()).toBeNull();
      expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    });

    it('escolher uma cor grava #RRGGBB e passa a oferecer "Usar a cor padrão"', async () => {
      const { host, radios, checked, defaultButton, flush } = await renderPalette();
      radios()[1].click();
      await flush();
      expect(host.control.value).toBe('#16A34A');
      expect(checked().map((r) => r.dataset['color'])).toEqual(['#16A34A']);
      expect(defaultButton()?.textContent?.trim()).toBe('Usar a cor padrão');
    });

    it('"Usar a cor padrão" grava null, desmarca tudo e some', async () => {
      const { host, checked, defaultButton, flush } = await renderPalette('#2563EB');
      expect(checked()).toHaveLength(1);
      defaultButton()!.click();
      await flush();
      expect(host.control.value).toBeNull();
      expect(host.control.dirty).toBe(true);
      expect(checked()).toHaveLength(0);
      expect(defaultButton()).toBeNull();
    });

    it('"Usar a cor padrão" devolve o foco ao grupo (primeira opção, a do Tab), não ao body', async () => {
      const { host, el, radios, defaultButton, flush } = await renderPalette('#16A34A');
      document.body.appendChild(el);
      try {
        defaultButton()!.focus();
        expect(document.activeElement).toBe(defaultButton());
        defaultButton()!.click();
        await flush();
        expect(host.control.value).toBeNull();
        expect(defaultButton()).toBeNull();
        expect(document.activeElement).not.toBe(document.body);
        expect(document.activeElement).toBe(radios()[0]);
        expect(radios()[0].tabIndex).toBe(0);
        expect(el.querySelector('[role="radiogroup"]')?.contains(document.activeElement)).toBe(true);
      } finally {
        el.remove();
      }
    });

    it('cor fora da paleta aparece como "Cor atual" sem perder o dado', async () => {
      const { host, radios, checked } = await renderPalette('#123abc');
      expect(radios()).toHaveLength(MINI_PALETTE.length + 1);
      expect(checked()[0].getAttribute('aria-label')).toBe('Cor atual (#123ABC)');
      expect(host.control.value).toBe('#123abc');
    });

    it('setas movem a escolha e o foco dentro da paleta, dando a volta', async () => {
      const { host, radios, checked, flush } = await renderPalette('#E11D48');
      key(radios()[2], 'ArrowRight');
      await flush();
      expect(checked()[0]).toBe(radios()[0]);
      expect(host.control.value).toBe('#2563EB');
      expect(document.activeElement).toBe(radios()[0]);
      key(radios()[0], 'ArrowLeft');
      await flush();
      expect(host.control.value).toBe('#E11D48');
    });

    it('desabilitado, esconde o botão da cor padrão e ignora cliques', async () => {
      const { host, radios, defaultButton, flush } = await renderPalette('#2563EB');
      host.control.disable();
      await flush();
      expect(defaultButton()).toBeNull();
      radios()[1].click();
      expect(host.control.value).toBe('#2563EB');
    });

    it('a paleta das categorias continua sendo a padrão, sem botão de cor padrão', async () => {
      const { el, radios } = await render();
      expect(radios()).toHaveLength(CATEGORY_COLORS.length);
      expect(el.querySelector('[data-default-color]')).toBeNull();
    });
  });
});
