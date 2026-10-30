import { Component, OnInit, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CurrentUser } from '../../api/current-user';
import { Avatar } from '../avatar/avatar';

const LABEL = 'Minha conta';

/**
 * Atalho para "Minha conta" na barra do topo: avatar com a inicial e o nome de quem está logado.
 * Busca o perfil sob demanda; enquanto carrega mostra um esqueleto e, se falhar (ex.: sem rede), cai
 * em "Minha conta" com o ícone de usuário, sem alarde. O nome só é exibido por interpolação.
 */
@Component({
  selector: 'gef-account-chip',
  imports: [Avatar, RouterLink, RouterLinkActive],
  template: `
    <a
      class="gef-account-chip"
      data-testid="account-chip"
      [routerLink]="link()"
      routerLinkActive="gef-account-chip-active"
      ariaCurrentWhenActive="page"
      [attr.aria-label]="label()"
      [attr.aria-busy]="loading() || null"
    >
      @if (loading()) {
        <span class="gef-skeleton h-9 w-9 shrink-0 rounded-full" aria-hidden="true"></span>
        <span class="gef-skeleton h-4 w-20" aria-hidden="true"></span>
      } @else {
        <gef-avatar [initial]="user.initial()" />
        <span class="gef-account-chip-name">{{ shownName() }}</span>
      }
    </a>
  `,
  host: { class: 'flex' },
})
export class AccountChip implements OnInit {
  protected readonly user = inject(CurrentUser);

  /** Destino do atalho (a tela Minha conta do app). */
  readonly link = input.required<string>();

  protected readonly loading = computed(() => this.user.profile() === null && !this.user.failed());
  protected readonly shownName = computed(() => this.user.displayName() ?? LABEL);
  protected readonly label = computed(() => {
    const name = this.user.displayName();
    return name ? `${LABEL} — ${name}` : LABEL;
  });

  ngOnInit(): void {
    this.user.load();
  }
}
