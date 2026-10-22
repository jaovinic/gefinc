import { Component, ElementRef, Injector, afterNextRender, effect, inject, input, output, untracked, viewChild } from '@angular/core';

/** Painéis abertos, do mais antigo ao mais novo: só o de cima reage ao Escape (há painéis dentro de painéis). */
const OPEN_SHEETS: object[] = [];

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Painel (modal) centralizado na tela, para filtros e
 * formulários curtos. Diálogo modal acessível: rótulo, foco preso, Escape e toque no fundo fecham,
 * e o foco volta para quem o abriu.
 */
@Component({
  selector: 'gef-sheet',
  template: `
    @if (open()) {
      <div class="gef-sheet-backdrop" [class.gef-sheet-backdrop-left]="side() === 'left'" role="presentation" (click)="onBackdrop($event)" (keydown)="onKeydown($event)">
        <div #dialog class="gef-sheet" [class.gef-sheet-left]="side() === 'left'" role="dialog" aria-modal="true" [attr.aria-label]="heading()">
          <header class="mb-3 flex items-center justify-between gap-3">
            <h2 class="text-title-md font-bold">{{ heading() }}</h2>
            <button type="button" class="gef-btn-secondary" aria-label="Fechar" (click)="closed.emit()">✕</button>
          </header>
          <ng-content />
        </div>
      </div>
    }
  `,
  host: { '(document:keydown.escape)': 'onDocumentEscape()' },
})
export class Sheet {
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  /** Escape fecha o painel mesmo quando o foco ficou fora dele, mas só o painel de cima (se houver mais de um). */
  protected onDocumentEscape(): void {
    if (this.open() && OPEN_SHEETS[OPEN_SHEETS.length - 1] === this) {
      this.closed.emit();
    }
  }

  readonly heading = input.required<string>();
  readonly open = input.required<boolean>();
  /** `bottom` (padrão) sobe da base da tela; `left` abre como gaveta lateral do menu. */
  readonly side = input<'bottom' | 'left'>('bottom');
  readonly closed = output<void>();

  private readonly injector = inject(Injector);
  private opener: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const open = this.open();
      untracked(() => {
        const index = OPEN_SHEETS.indexOf(this);
        if (open && index === -1) {
          OPEN_SHEETS.push(this);
        } else if (!open && index !== -1) {
          OPEN_SHEETS.splice(index, 1);
        }
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
    event.stopPropagation(); // um painel dentro de outro não pode ser tratado também pelo de fora
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
    const dialog = this.dialog()?.nativeElement;
    if (!dialog) {
      return [];
    }
    // ignora os campos de um painel aninhado: eles pertencem ao outro painel
    return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.closest('[role="dialog"]') === dialog);
  }
}
