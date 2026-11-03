import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CurrentUser } from '../../api/current-user';
import { Avatar } from '../avatar/avatar';

const LABEL = 'Minha conta';

/**
 * Atalho do topo com o avatar (a inicial) e o nome de quem está logado. No modo `link` (web) leva à tela
 * Minha conta; no modo `action` (app) é um botão que avisa o hospedeiro (`activated`) para abrir um menu.
 * Busca o perfil sob demanda; enquanto carrega mostra um esqueleto e, se falhar (ex.: sem rede), cai
 * em "Minha conta" com o ícone de usuário, sem alarde. O nome só é exibido por interpolação.
 */
@Component({
  selector: 'gef-account-chip',
  imports: [Avatar, NgTemplateOutlet, RouterLink, RouterLinkActive],
  template: `
    <ng-template #content>
      @if (loading()) {
        <span class="gef-skeleton h-9 w-9 shrink-0 rounded-full" aria-hidden="true"></span>
        <span class="gef-skeleton h-4 w-20" aria-hidden="true"></span>
      } @else {
        <gef-avatar [initial]="user.initial()" />
        <span class="gef-account-chip-name">{{ shownName() }}</span>
      }
    </ng-template>
    @if (mode() === 'action') {
      <button
        type="button"
        class="gef-account-chip"
        [class.gef-account-chip-active]="expanded() || active()"
        data-testid="account-chip"
        aria-haspopup="dialog"
        [attr.aria-expanded]="expanded()"
        [attr.aria-label]="actionLabel()"
        [attr.aria-busy]="loading() || null"
        (click)="activated.emit()"
      >
        <ng-container *ngTemplateOutlet="content" />
      </button>
    } @else {
      <a
        class="gef-account-chip"
        data-testid="account-chip"
        [routerLink]="link()"
        routerLinkActive="gef-account-chip-active"
        ariaCurrentWhenActive="page"
        [attr.aria-label]="label()"
        [attr.aria-busy]="loading() || null"
      >
        <ng-container *ngTemplateOutlet="content" />
      </a>
    }
  `,
  host: { class: 'flex' },
})
export class AccountChip implements OnInit {
  protected readonly user = inject(CurrentUser);

  /** Destino do atalho no modo `link` (a tela Minha conta). */
  readonly link = input<string>('');
  /** `link` navega; `action` é um botão que abre um menu e avisa por `activated`. */
  readonly mode = input<'link' | 'action'>('link');
  /** No modo `action`: o menu aberto por este botão está visível. */
  readonly expanded = input(false);
  /** No modo `action`: destaque extra (ex.: a rota atual é Minha conta). */
  readonly active = input(false);
  readonly activated = output<void>();

  protected readonly loading = computed(() => this.user.profile() === null && !this.user.failed());
  protected readonly shownName = computed(() => this.user.displayName() ?? LABEL);
  protected readonly label = computed(() => {
    const name = this.user.displayName();
    return name ? `${LABEL} — ${name}` : LABEL;
  });
  /** Rótulo do modo `action`: contém o texto visível (nome ou "Minha conta"), como pede a WCAG 2.5.3. */
  protected readonly actionLabel = computed(() => (this.loading() ? 'Mais opções' : `Mais opções — ${this.shownName()}`));

  ngOnInit(): void {
    this.user.load();
  }
}
