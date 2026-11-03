import { DOCUMENT } from '@angular/common';
import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { GlassService } from '@gefinc/ui-shared';

/** Sem `scrollend`: a rolagem acabou quando passa este tempo sem eventos (eles seguem durante a inércia). */
export const IDLE_MS = 150;
/** Com `scrollend`: só uma rede de segurança caso o evento não venha (ele marca o fim de verdade). */
export const SAFETY_MS = 1000;

/**
 * Desliga o desfoque do vidro enquanto o conteúdo rola e o religa ao parar. Medido no celular a 120 Hz: o
 * `backdrop-filter` sob uma superfície fixa sobre conteúdo que rola custa ~8 pontos de quadros lentos, e reduzir
 * o raio não ajuda. Durante a rolagem a raiz leva `data-scrolling`, que troca `--glass-filter` por `none` e a ilha
 * e o botão flutuante por fundos mais opacos (ver `styles.css`); parado, o desfoque real volta. Só o app móvel usa:
 * no web o desfoque fica sempre ligado (não foi medido problema lá). Sem custo com o desfoque desligado
 * (escolha "sólido" ou sistema pedindo menos transparência): nada é marcado nem agendado.
 */
@Directive({ selector: '[gefScrollGlass]' })
export class ScrollGlass {
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly glass = inject(GlassService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly hasScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly onScroll = () => {
    if (!this.glass.active()) {
      return;
    }
    if (!this.root.hasAttribute('data-scrolling')) {
      this.root.setAttribute('data-scrolling', '');
    }
    this.arm(this.hasScrollEnd ? SAFETY_MS : IDLE_MS);
  };
  private readonly onScrollEnd = () => this.stop();

  constructor() {
    this.host.addEventListener('scroll', this.onScroll, { passive: true });
    if (this.hasScrollEnd) {
      this.host.addEventListener('scrollend', this.onScrollEnd, { passive: true });
    }
    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('scroll', this.onScroll);
      this.host.removeEventListener('scrollend', this.onScrollEnd);
      this.stop();
    });
  }

  private arm(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.stop(), ms);
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.root.removeAttribute('data-scrolling');
  }
}
