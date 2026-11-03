import { Component, inject } from '@angular/core';
import { GlassService } from './glass.service';

let nextId = 0;

/**
 * Interruptor do desfoque do vidro (Aparência). Ligado por padrão; desligado, as superfícies de vidro
 * (ilha de navegação, botão flutuante, painéis) ficam sólidas. Se o sistema pede menos transparência ou mais
 * contraste, o desfoque fica desligado de qualquer forma e o aviso explica por quê.
 */
@Component({
  selector: 'gef-glass-toggle',
  template: `
    <label class="gef-switch-row" data-testid="glass-toggle">
      <input
        type="checkbox"
        role="switch"
        class="gef-switch"
        [checked]="glass.enabled()"
        [attr.aria-describedby]="hint"
        (change)="glass.set($any($event.target).checked ? 'blur' : 'flat')"
      />
      <span>Desfoque (vidro)</span>
    </label>
    <p [id]="hint" class="text-caption text-gefinc-muted">Borra o fundo atrás da barra de navegação, dos botões e dos painéis. Desligue para ter superfícies sólidas.</p>
    @if (glass.forcedFlat()) {
      <p class="gef-alert-warning" role="status" data-testid="glass-forced-notice">
        Seu aparelho pede menos transparência ou mais contraste, então o desfoque está desligado por enquanto.
      </p>
    }
  `,
})
export class GlassToggle {
  protected readonly glass = inject(GlassService);
  protected readonly hint = `gef-glass-hint-${nextId++}`;
}
