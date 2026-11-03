import { Injectable } from '@angular/core';
import { Subscription } from 'rxjs';

/**
 * Leituras que passaram do limite de espera da rede, foram respondidas pela cópia local e seguem vivas em
 * segundo plano para renovar a cópia quando o servidor responder. No máximo uma por endereço (e por usuário);
 * todas são canceladas ao encerrar a sessão.
 */
@Injectable({ providedIn: 'root' })
export class BackgroundReads {
  private readonly pending = new Map<string, Subscription>();

  has(key: string): boolean {
    return this.pending.has(key);
  }

  /** Passa a acompanhar a leitura; ao terminar ou ser cancelada, ela sai da lista sozinha. */
  adopt(key: string, read: Subscription): void {
    this.pending.set(key, read);
    read.add(() => {
      if (this.pending.get(key) === read) {
        this.pending.delete(key);
      }
    });
  }

  cancelAll(): void {
    const reads = [...this.pending.values()];
    this.pending.clear();
    reads.forEach((read) => read.unsubscribe());
  }
}
