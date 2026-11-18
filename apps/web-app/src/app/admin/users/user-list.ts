import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnDestroy, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AdminUserCounts, AdminUserRow } from '@gefinc/core-models';
import { EmptyView, ErrorView, Icon, LoadingView, Select, isOfflineProblem, messageFor, toProblem, type SelectOption } from '@gefinc/ui-shared';
import type { Subscription } from 'rxjs';
import { AdminApi, type AdminSortDirection, type AdminUserSort, type AdminUserStatus } from '../admin.api';
import { formatAdminDateTime } from '../admin-format';
import { roleLabel, statusBadges, type StatusBadge } from '../admin-status';

/** Pausa, em ms, depois da última tecla antes de buscar. */
const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 25;
const SEARCH_MAX_LENGTH = 100;

let nextId = 0;

const STATUS_OPTIONS: SelectOption[] = [
  { value: '', label: 'Todas as situações' },
  { value: 'ACTIVE', label: 'Ativos' },
  { value: 'SUSPENDED', label: 'Suspensos' },
  { value: 'DELETION_PENDING', label: 'Aguardando exclusão' },
  { value: 'ADMIN', label: 'Administradores' },
];
const SORT_OPTIONS: SelectOption[] = [
  { value: 'createdAt', label: 'Data de criação' },
  { value: 'lastAccessAt', label: 'Último acesso' },
];
const DIRECTION_OPTIONS: SelectOption[] = [
  { value: 'desc', label: 'Mais recentes primeiro' },
  { value: 'asc', label: 'Mais antigos primeiro' },
];

/**
 * Lista de usuários do painel: busca por e-mail ou nome (sem caixa nem acento, no servidor, com pausa de
 * 300 ms), filtro de situação, ordenação, contagens por situação e paginação. Mostra só dados de conta: nada
 * financeiro e nenhuma exportação. A situação aparece em texto e ícone, nunca só em cor.
 */
@Component({
  selector: 'gef-admin-user-list',
  imports: [EmptyView, ErrorView, FormsModule, Icon, LoadingView, RouterLink, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4" aria-labelledby="users-heading">
      <h2 id="users-heading" class="text-title-md font-bold" tabindex="-1" data-testid="results-heading" #resultsHeading>Usuários</h2>

      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,12rem))] md:items-end">
        <div>
          <label class="gef-label" [attr.for]="searchId">Buscar por e-mail ou nome</label>
          <input
            type="search"
            class="gef-input"
            autocomplete="off"
            [id]="searchId"
            [attr.maxlength]="searchMaxLength"
            [value]="search()"
            (input)="onSearch($event)"
          />
        </div>
        <gef-select label="Situação" [options]="statusOptions" [ngModel]="status()" (ngModelChange)="onStatus($event)" />
        <gef-select label="Ordenar por" [options]="sortOptions" [ngModel]="sort()" (ngModelChange)="onSort($event)" />
        <gef-select label="Ordem" [options]="directionOptions" [ngModel]="direction()" (ngModelChange)="onDirection($event)" />
      </div>

      @if (counts(); as c) {
        <ul class="flex flex-wrap gap-2 text-caption text-gefinc-muted" data-testid="counts" aria-label="Usuários por situação">
          <li class="rounded-full border border-gefinc-border px-3 py-1">Ativos <strong class="text-gefinc-text">{{ c.active }}</strong></li>
          <li class="rounded-full border border-gefinc-border px-3 py-1">Suspensos <strong class="text-gefinc-text">{{ c.suspended }}</strong></li>
          <li class="rounded-full border border-gefinc-border px-3 py-1">Aguardando exclusão <strong class="text-gefinc-text">{{ c.deletionPending }}</strong></li>
          <li class="rounded-full border border-gefinc-border px-3 py-1">Administradores <strong class="text-gefinc-text">{{ c.admin }}</strong></li>
        </ul>
      }

      <p class="sr-only" role="status" aria-live="polite" data-testid="result-status">{{ announcement() }}</p>

      @if (loading()) {
        <gef-loading variant="list" message="Carregando usuários…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" [variant]="loadOffline() ? 'offline' : 'error'" (retry)="load()" />
      } @else if (items().length === 0) {
        <gef-empty icon="search" [title]="'Nenhum usuário encontrado'" hint="Tente outro texto de busca ou limpe os filtros.">
          <button type="button" class="gef-btn-secondary" (click)="clearFilters()">Limpar filtros</button>
        </gef-empty>
      } @else {
        <div class="gef-table-wrap">
          <table class="gef-table">
            <caption class="sr-only">Usuários cadastrados</caption>
            <thead>
              <tr>
                <th scope="col">Usuário</th>
                <th scope="col">Situação</th>
                <th scope="col">Perfil</th>
                <th scope="col">Criado em</th>
                <th scope="col">Último acesso</th>
              </tr>
            </thead>
            <tbody>
              @for (user of items(); track user.id) {
                <tr data-testid="user-row">
                  <td>
                    <a class="font-medium text-gefinc-primary underline-offset-2 hover:underline" [routerLink]="['/admin/users', user.id]">{{ user.email }}</a>
                    <p class="text-caption text-gefinc-muted">{{ user.name || 'Sem nome' }}</p>
                  </td>
                  <td data-testid="status">
                    <span class="flex flex-wrap gap-1">
                      @for (badge of badges(user); track badge.label) {
                        <span class="gef-badge" [class]="badge.tone"><gef-icon [name]="badge.icon" [size]="14" />{{ badge.label }}</span>
                      }
                    </span>
                  </td>
                  <td data-testid="role">
                    @if (user.role === 'USER') {
                      <span class="text-gefinc-muted">Usuário</span>
                    } @else {
                      <span class="inline-flex items-center gap-1 font-medium"><gef-icon name="shield" [size]="14" />{{ roleName(user.role) }}</span>
                    }
                  </td>
                  <td class="whitespace-nowrap">{{ date(user.createdAt) }}</td>
                  <td class="whitespace-nowrap">{{ user.lastAccessAt ? date(user.lastAccessAt) : 'Nunca acessou' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <nav class="flex flex-wrap items-center justify-between gap-2 text-body-base text-gefinc-muted" aria-label="Paginação">
          <span class="whitespace-nowrap">Página {{ page() + 1 }} de {{ totalPages() }}</span>
          <span class="flex gap-3">
            <button type="button" class="gef-btn-secondary" [disabled]="page() === 0" (click)="goTo(page() - 1)">Anterior</button>
            <button type="button" class="gef-btn-secondary" [disabled]="page() + 1 >= totalPages()" (click)="goTo(page() + 1)">Próxima</button>
          </span>
        </nav>
      }
    </section>
  `,
})
export class UserList implements OnInit, OnDestroy {
  private readonly api = inject(AdminApi);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('resultsHeading');

  protected readonly searchId = `admin-user-search-${nextId++}`;
  protected readonly searchMaxLength = SEARCH_MAX_LENGTH;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly directionOptions = DIRECTION_OPTIONS;

  /** Texto do campo (a cada tecla). A busca só usa o que valeu depois da pausa: `appliedQuery`. */
  protected readonly search = signal('');
  protected readonly status = signal<'' | AdminUserStatus>('');
  protected readonly sort = signal<AdminUserSort>('createdAt');
  protected readonly direction = signal<AdminSortDirection>('desc');
  protected readonly page = signal(0);

  protected readonly items = signal<AdminUserRow[]>([]);
  protected readonly total = signal(0);
  protected readonly counts = signal<AdminUserCounts | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loadOffline = signal(false);
  protected readonly announcement = signal('');
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  private appliedQuery = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: Subscription | null = null;

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.cancelTimer();
    this.request?.unsubscribe();
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.search.set(value);
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      const query = value.trim();
      if (query !== this.appliedQuery) {
        this.appliedQuery = query;
        this.page.set(0);
        this.load();
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  protected onStatus(value: string | number): void {
    this.status.set(String(value) as '' | AdminUserStatus);
    this.page.set(0);
    this.load();
  }

  protected onSort(value: string | number): void {
    this.sort.set(String(value) as AdminUserSort);
    this.page.set(0);
    this.load();
  }

  protected onDirection(value: string | number): void {
    this.direction.set(String(value) as AdminSortDirection);
    this.page.set(0);
    this.load();
  }

  protected clearFilters(): void {
    this.cancelTimer();
    this.search.set('');
    this.appliedQuery = '';
    this.status.set('');
    this.sort.set('createdAt');
    this.direction.set('desc');
    this.page.set(0);
    this.load();
  }

  protected goTo(target: number): void {
    if (target < 0 || target >= this.totalPages()) {
      return;
    }
    this.page.set(target);
    this.load(true);
  }

  protected load(moveFocus = false): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.loadError.set(null);
    this.announcement.set('');
    this.request = this.api
      .listUsers({
        q: this.appliedQuery || undefined,
        status: this.status() || undefined,
        sort: this.sort(),
        dir: this.direction(),
        page: this.page(),
        size: PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          this.items.set(result.content);
          this.total.set(result.totalElements);
          this.counts.set(result.counts);
          this.page.set(result.page);
          this.loading.set(false);
          this.announcement.set(this.announce(result.totalElements, result.page));
          if (moveFocus) {
            afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
          }
        },
        error: (error: unknown) => {
          const problem = toProblem(error);
          this.loadOffline.set(isOfflineProblem(problem));
          this.loadError.set(messageFor(problem));
          this.loading.set(false);
        },
      });
  }

  protected roleName = roleLabel;

  protected date(iso: string): string {
    return formatAdminDateTime(iso);
  }

  protected badges(user: AdminUserRow): StatusBadge[] {
    return statusBadges(user);
  }

  private announce(total: number, page: number): string {
    if (total === 0) {
      return 'Nenhum usuário encontrado.';
    }
    const noun = total === 1 ? 'usuário encontrado' : 'usuários encontrados';
    return `${total} ${noun}. Página ${page + 1} de ${Math.max(1, Math.ceil(total / PAGE_SIZE))}.`;
  }

  private cancelTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
