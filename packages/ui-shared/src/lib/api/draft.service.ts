import { Injectable } from '@angular/core';

const PREFIX = 'gefinc:draft:';

/**
 * Preserva formulários não enviados quando a sessão expira: cada tela registra um leitor do seu
 * rascunho; ao perder a sessão tudo é salvo e a tela retoma o conteúdo depois do novo login.
 */
@Injectable({ providedIn: 'root' })
export class DraftService {
  private readonly readers = new Map<string, () => unknown>();

  register(key: string, reader: () => unknown): () => void {
    this.readers.set(key, reader);
    return () => this.readers.delete(key);
  }

  snapshotAll(): void {
    for (const [key, reader] of this.readers) {
      try {
        sessionStorage.setItem(PREFIX + key, JSON.stringify(reader()));
      } catch {
        // Armazenamento indisponível: o rascunho é descartado, o app continua funcionando.
      }
    }
  }

  take<T>(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      if (raw === null) {
        return null;
      }
      sessionStorage.removeItem(PREFIX + key);
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}
