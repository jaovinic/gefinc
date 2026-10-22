import { Injectable, signal } from '@angular/core';

/** Largura a partir da qual as telas usam a apresentação de desktop (tabelas). */
const COMPACT_QUERY = '(max-width: 767px)';

/**
 * Diz se a tela é "compacta" (celular). As telas compartilhadas entre web e mobile escolhem por
 * aqui entre tabela (desktop) e lista de cartões (celular), sem duplicar o DOM com CSS.
 */
@Injectable({ providedIn: 'root' })
export class Viewport {
  private readonly query = typeof window.matchMedia === 'function' ? window.matchMedia(COMPACT_QUERY) : null;

  readonly compact = signal(this.query?.matches ?? false);

  constructor() {
    this.query?.addEventListener('change', (event) => this.compact.set(event.matches));
  }
}
