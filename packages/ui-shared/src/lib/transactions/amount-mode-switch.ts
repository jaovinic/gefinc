import { Component, computed, input, output } from '@angular/core';
import { Icon } from '../icons/icon';
import type { AmountMode } from './installment-amount';

let nextId = 0;

const OPTIONS: Record<AmountMode, string> = { INSTALLMENT: 'Valor da parcela', TOTAL: 'Valor total' };

/**
 * Seletor de como o valor foi digitado: "Valor da parcela" ou "Valor total". Fica fora do campo de valor,
 * com legenda e texto de apoio. Quem hospeda guarda o modo (`value`) e reage a `changed`; `byPointer` diz se a
 * escolha veio de toque ou mouse (`detail > 0`), para devolver o foco ao valor só nesse caso.
 */
@Component({
  selector: 'gef-amount-mode-switch',
  host: { class: 'block' },
  imports: [Icon],
  template: `
    <div class="space-y-2" data-testid="amount-mode-switch">
      <p class="gef-label !mb-0">O valor digitado é</p>
      <div class="gef-seg-track" role="group" aria-label="Forma de informar" [attr.aria-describedby]="helpId">
        @for (mode of modes(); track mode) {
          <button type="button" class="gef-seg-btn px-2 text-center leading-tight" [attr.aria-pressed]="value() === mode" (click)="pick(mode, $event)">
            @if (value() === mode) {
              <gef-icon name="check" [size]="16" />
            }
            {{ labels[mode] }}
          </button>
        }
      </div>
      <p class="text-caption text-gefinc-muted" [id]="helpId" data-testid="amount-mode-help">{{ help() }}</p>
    </div>
  `,
})
export class AmountModeSwitch {
  readonly value = input.required<AmountMode>();
  /** Número de parcelas, só para o texto de apoio. */
  readonly count = input<number | null>(null);
  /** Qual opção vem primeiro (o app começa pela parcela; o cadastro completo, pelo total). */
  readonly order = input<'installment-first' | 'total-first'>('installment-first');
  readonly changed = output<{ mode: AmountMode; byPointer: boolean }>();

  protected readonly labels = OPTIONS;
  protected readonly helpId = `gef-amount-mode-help-${nextId++}`;
  protected readonly modes = computed<AmountMode[]>(() => (this.order() === 'total-first' ? ['TOTAL', 'INSTALLMENT'] : ['INSTALLMENT', 'TOTAL']));
  protected readonly help = computed(() => {
    const count = this.count();
    const times = count && count >= 2 ? `${count} vezes` : 'as parcelas';
    return this.value() === 'INSTALLMENT'
      ? `Parcela: o valor digitado se repete em ${times} para formar o total.`
      : `Total: o valor digitado é dividido em ${times}.`;
  });

  protected pick(mode: AmountMode, event: MouseEvent): void {
    this.changed.emit({ mode, byPointer: event.detail > 0 });
  }
}
