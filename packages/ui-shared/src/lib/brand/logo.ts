import { Component, computed, input } from '@angular/core';

let nextGradient = 0;

/**
 * Logo do GEFINC: o símbolo (hexágono com seta de crescimento e barras de parcelas, no gradiente
 * Aurora FinTech) sozinho ou junto do nome. O desenho é o mesmo de `src/brand/gefinc-symbol.svg`.
 */
@Component({
  selector: 'gef-logo',
  template: `
    <svg
      viewBox="0 0 128 128"
      [attr.width]="size()"
      [attr.height]="size()"
      role="img"
      aria-label="GEFINC"
      focusable="false"
    >
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#00E599" />
          <stop offset="1" stop-color="#00B4D8" />
        </linearGradient>
      </defs>
      <path
        d="M64 8 L113 36 V92 L64 120 L15 92 V36 Z"
        fill="none"
        [attr.stroke]="gradientRef"
        stroke-width="7"
        stroke-linejoin="round"
      />
      <path
        d="M38 74 L82 30 M64 30 H82 V48"
        fill="none"
        [attr.stroke]="gradientRef"
        stroke-width="7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <rect x="44" y="80" width="10" height="16" rx="2.5" [attr.fill]="gradientRef" />
      <rect x="60" y="68" width="10" height="28" rx="2.5" [attr.fill]="gradientRef" />
      <rect x="76" y="56" width="10" height="40" rx="2.5" [attr.fill]="gradientRef" />
    </svg>
    @if (showName()) {
      <span class="gef-wordmark" [style.font-size.px]="size() * 0.6">GEFINC</span>
    }
  `,
  host: { class: 'inline-flex items-center gap-2' },
})
export class Logo {
  /** `symbol` mostra só o símbolo; `full` (padrão) acrescenta o nome. */
  readonly variant = input<'symbol' | 'full'>('full');
  readonly size = input(32);

  protected readonly showName = computed(() => this.variant() === 'full');
  protected readonly gradientId = `gef-aurora-${nextGradient++}`;
  protected readonly gradientRef = `url(#${this.gradientId})`;
}
