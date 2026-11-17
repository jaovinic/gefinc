import { Component, OnInit, inject, signal } from '@angular/core';
import { Icon, SystemApi } from '@gefinc/ui-shared';

/**
 * Faixa de aviso de manutenção no app móvel. Informa que o sistema está em manutenção
 * e que os lançamentos e alterações locais continuam seguros e salvos no aparelho,
 * sincronizando assim que o serviço for restabelecido.
 */
@Component({
  selector: 'gef-maintenance-banner',
  host: { class: 'block' },
  imports: [Icon],
  template: `
    @if (maintenance()) {
      <div
        data-testid="maintenance-banner"
        class="flex items-start gap-2 border-b border-gefinc-border bg-amber-500/10 px-4 py-2 text-caption text-amber-500"
        role="status"
      >
        <gef-icon name="alert-triangle" [size]="16" class="mt-0.5 shrink-0" />
        <p>
          <span class="font-semibold">Sistema em manutenção.</span>
          {{ message() || 'Suas alterações continuam salvas no aparelho e serão sincronizadas assim que a manutenção terminar.' }}
        </p>
      </div>
    }
  `,
})
export class MaintenanceBanner implements OnInit {
  private readonly systemApi = inject(SystemApi);

  readonly maintenance = signal(false);
  readonly message = signal<string | null>(null);

  ngOnInit(): void {
    this.systemApi.status().subscribe({
      next: (status) => {
        this.maintenance.set(status.maintenance);
        this.message.set(status.message ?? null);
      },
      error: () => {
        // Silencioso em caso de falha de rede
      },
    });
  }
}
