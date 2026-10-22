import { Component, Injector, afterNextRender, effect, inject, input, output, untracked } from '@angular/core';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Painel que sobe da base da tela (celular) ou aparece centralizado (desktop), para filtros e
 * formulários curtos. Diálogo modal acessível: rótulo, foco preso, Escape e toque no fundo fecham,
 * e o foco volta para quem o abriu.
 */
@Component({
  selector: 'gef-sheet',
  template: `
    @if (open()) {
      <div class="gef-sheet-backdrop" role="presentation" (click)="onBackdrop($event)" (keydown)="onKeydown($event)">
        <div class="gef-sheet" role="dialog" aria-modal="true" [attr.aria-label]="heading()">
          <header class="mb-3 flex items-center justify-between gap-3">
            <h2 class="text-title-md font-bold">{{ heading() }}</h2>
            <button type="button" class="gef-btn-secondary" aria-label="Fechar" (click)="closed.emit()">✕</button>
          </header>
          <ng-content />
        </div>
      </div>
    }
  `,
})
export class Sheet {
  readonly heading = input.required<string>();
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly injector = inject(Injector);
  private opener: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const open = this.open();
      untracked(() => {
        if (open) {
          this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          afterNextRender(() => this.focusables()[0]?.focus(), { injector: this.injector });
        } else if (this.opener) {
          this.opener.focus();
          this.opener = null;
        }
      });
    });
  }

  /** Só o toque no fundo fecha; toques dentro do painel sobem até aqui e são ignorados. */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const items = this.focusables();
    if (items.length === 0) {
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusables(): HTMLElement[] {
    const dialog = document.querySelector('[role="dialog"].gef-sheet');
    return dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
  }
}
