import { DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '@gefinc/ui-shared';
import { NetworkStatus } from './network-status';
import { OfflineState } from './offline-state';
import { PendingQueue } from './pending-queue';
import { SyncEngine } from './sync-engine';

/**
 * Faixa de aviso do modo offline: sem conexão e com que data estão os dados, operações pendentes de
 * envio (e o que ainda não as inclui), recusas a resolver e o botão "Sincronizar agora". A versão
 * `compact` é uma só linha, para a tela de novo lançamento.
 */
@Component({
  selector: 'gef-offline-banner',
  host: { class: 'block' },
  imports: [DatePipe, Icon, RouterLink],
  template: `
    @if (compact()) {
      @if (!network.online()) {
        <div data-testid="offline-banner" class="flex items-start gap-2 border-b border-gefinc-border bg-(--glass-bg) px-4 py-2 text-caption" role="status">
          <gef-icon name="wifi-off" [size]="16" class="mt-0.5 shrink-0 text-gefinc-warning" />
          <p>
            <span class="font-semibold text-gefinc-warning">Sem conexão.</span>
            O lançamento fica salvo no aparelho e é enviado quando houver conexão.
          </p>
        </div>
      }
    } @else if (visible()) {
      <div data-testid="offline-banner" class="space-y-1 border-b border-gefinc-border bg-(--glass-bg) px-4 py-2 text-caption" role="status">
        @if (!network.online()) {
          <p class="font-semibold text-gefinc-warning">
            Sem conexão.
            @if (state.staleSince(); as since) {
              <span class="font-normal text-gefinc-muted">Dados de {{ since | date: 'dd/MM/yyyy' }} às {{ since | date: 'HH:mm' }}.</span>
            }
          </p>
        } @else if (state.staleSince(); as since) {
          <p class="text-gefinc-muted">Dados de {{ since | date: 'dd/MM/yyyy' }} às {{ since | date: 'HH:mm' }}.</p>
        }
        @if (pending() > 0) {
          <p>
            {{ pending() }} {{ pending() === 1 ? 'operação pendente' : 'operações pendentes' }} de envio.
            <span class="text-gefinc-muted">Painel, faturas e fluxo de caixa ainda não incluem {{ pending() === 1 ? 'essa operação' : 'essas operações' }}.</span>
          </p>
        }
        @if (rejectedCount() > 0) {
          <p class="text-gefinc-danger">{{ rejectedCount() }} {{ rejectedCount() === 1 ? 'operação recusada' : 'operações recusadas' }} pelo servidor.</p>
        }
        @if (pending() > 0 || rejectedCount() > 0) {
          <div class="flex flex-wrap items-center gap-2 pt-1">
            @if (pending() > 0) {
              <button type="button" class="gef-btn-secondary" [disabled]="!network.online() || engine.syncing()" (click)="engine.flush()">
                Sincronizar agora
              </button>
            }
            <a class="gef-btn-secondary" routerLink="/pendencias">Ver pendências</a>
          </div>
        }
      </div>
    }
  `,
})
export class OfflineBanner {
  /** Versão de uma linha para telas fora da casca (novo lançamento): só avisa que está sem conexão. */
  readonly compact = input(false);
  protected readonly network = inject(NetworkStatus);
  protected readonly state = inject(OfflineState);
  protected readonly engine = inject(SyncEngine);
  private readonly queue = inject(PendingQueue);

  protected readonly pending = this.queue.pendingCount;
  protected readonly rejectedCount = computed(() => this.queue.rejected().length);
  protected readonly visible = computed(
    () => !this.network.online() || this.state.staleSince() !== null || this.pending() > 0 || this.rejectedCount() > 0,
  );
}
