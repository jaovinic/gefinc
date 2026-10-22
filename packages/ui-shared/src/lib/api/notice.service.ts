import { Injectable, signal } from '@angular/core';

/** Avisos globais da interface (ex.: conflito de edição entre dispositivos). */
@Injectable({ providedIn: 'root' })
export class NoticeService {
  readonly message = signal<string | null>(null);
  /** Cresce a cada `409 STALE_VERSION`; as telas observam para recarregar o registro. */
  readonly staleVersionCount = signal(0);

  /** Cresce quando os dados mudaram por fora da tela (ex.: operações pendentes enviadas); as telas recarregam. */
  readonly dataChangedCount = signal(0);

  dataChanged(): void {
    this.dataChangedCount.update((n) => n + 1);
  }

  staleVersion(): void {
    this.message.set(
      'Este registro foi alterado em outro dispositivo. Mostramos a versão mais recente; revise antes de salvar de novo.',
    );
    this.staleVersionCount.update((n) => n + 1);
  }

  dismiss(): void {
    this.message.set(null);
  }
}
