import { Component, inject } from '@angular/core';
import { NoticeService } from '../api/notice.service';
import { Icon } from '../icons/icon';

/**
 * Região das confirmações discretas (salvo, pago, enviado). Fica uma vez em cada casca (web e app),
 * acima da barra de abas no celular. É uma região de status: leitores de tela anunciam sem tirar o foco.
 */
@Component({
  selector: 'gef-toast-host',
  imports: [Icon],
  template: `
    <div class="gef-toast-region" aria-live="polite" aria-atomic="false" data-testid="toast-region">
      @for (toast of notices.toasts(); track toast.id) {
        <div class="gef-toast" data-testid="toast">
          <gef-icon name="check" [size]="18" />
          <span class="flex-1">{{ toast.message }}</span>
          @if (toast.undo) {
            <button type="button" class="gef-btn-sm min-h-9 border-gefinc-secondary/50 px-2 text-gefinc-secondary" (click)="notices.runUndo(toast.id)">Desfazer</button>
          }
          <button type="button" class="min-h-9 min-w-9 text-gefinc-muted" aria-label="Fechar aviso" (click)="notices.dismissToast(toast.id)">
            <gef-icon name="close" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly notices = inject(NoticeService);
}
