import { Injectable, signal } from '@angular/core';

/** Confirmação discreta (toast), opcionalmente com uma ação para desfazer. */
export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly undo?: () => void;
}

const TOAST_MS = 6000;

/**
 * Janela de coalescência de `dataChanged()`: o primeiro aviso passa na hora; os que chegam dentro da janela
 * viram um só ao final dela. Evita recargas em cascata (aquecimento da cópia local, leituras tardias, envio da
 * fila) sem atrasar a atualização depois de uma ação do usuário, que recarrega a tela direto.
 */
export const DATA_CHANGED_COALESCE_MS = 1500;
const MAX_TOASTS = 3;

/** Avisos globais da interface (ex.: conflito de edição entre dispositivos). */
@Injectable({ providedIn: 'root' })
export class NoticeService {
  readonly message = signal<string | null>(null);
  /** Cresce a cada `409 STALE_VERSION`; as telas observam para recarregar o registro. */
  readonly staleVersionCount = signal(0);

  /** Cresce quando os dados mudaram por fora da tela (ex.: operações pendentes enviadas); as telas recarregam. */
  readonly dataChangedCount = signal(0);

  /** Confirmações discretas na tela (salvo, pago, enviado); somem sozinhas e podem oferecer "Desfazer". */
  readonly toasts = signal<Toast[]>([]);
  private nextToastId = 1;

  /** Mostra uma confirmação por alguns segundos; mantém no máximo 3, descartando as mais antigas. */
  toast(message: string, options: { undo?: () => void } = {}): void {
    const id = this.nextToastId++;
    this.toasts.update((list) => [...list, { id, message, undo: options.undo }].slice(-MAX_TOASTS));
    setTimeout(() => this.dismissToast(id), TOAST_MS);
  }

  dismissToast(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  runUndo(id: number): void {
    const toast = this.toasts().find((t) => t.id === id);
    this.dismissToast(id);
    toast?.undo?.();
  }

  private coalescing = false;
  private changedWhileCoalescing = false;

  dataChanged(): void {
    if (this.coalescing) {
      this.changedWhileCoalescing = true;
      return;
    }
    this.dataChangedCount.update((n) => n + 1);
    this.coalescing = true;
    setTimeout(() => {
      this.coalescing = false;
      if (this.changedWhileCoalescing) {
        this.changedWhileCoalescing = false;
        this.dataChanged();
      }
    }, DATA_CHANGED_COALESCE_MS);
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
