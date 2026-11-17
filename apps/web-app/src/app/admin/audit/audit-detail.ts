import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import type { AuditEntry } from '@gefinc/core-models';
import { ErrorView, LoadingView, isOfflineProblem, messageFor, toProblem } from '@gefinc/ui-shared';
import type { Subscription } from 'rxjs';
import { AdminApi } from '../admin.api';

/** Rótulos legíveis das chaves de `AuditKey` exibidas no resumo estruturado. */
const DETAIL_KEY_LABELS: Readonly<Record<string, string>> = {
  field: 'Campo',
  from: 'De',
  to: 'Para',
  emailRef: 'Referência do e-mail',
  oldEmailRef: 'Referência do e-mail anterior',
  oldNameRef: 'Referência do nome anterior',
  days: 'Dias',
  mode: 'Modo',
  reasonId: 'Motivo (ID)',
  parameter: 'Parâmetro',
  count: 'Quantidade',
  requestId: 'Solicitação (ID)',
};

/**
 * Painel expansível de detalhe de uma linha da auditoria (`GET /admin/audit/{id}`). Mostra a
 * justificativa (`reason`), o código de recusa (`refusalCode`), o alvo não-usuário (`subject`), o
 * resumo estruturado (`details`, só chaves conhecidas) e a origem da tentativa (`client`:
 * referência anônima `anônimo-…`, IP real e dispositivo enquanto não expurgados). Somente leitura:
 * nunca há controles de editar, excluir ou exportar.
 */
@Component({
  selector: 'gef-admin-audit-detail',
  imports: [ErrorView, LoadingView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-lg border border-gefinc-border bg-gefinc-surface/60 p-4 text-body-base" data-testid="audit-detail">
      @if (loading()) {
        <gef-loading variant="spinner" message="Carregando detalhes do registro…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" [variant]="loadOffline() ? 'offline' : 'error'" (retry)="load()" />
      } @else if (entry(); as e) {
        <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt class="text-caption text-gefinc-muted">Código da ação</dt>
            <dd data-testid="detail-action">{{ e.action }}</dd>
          </div>
          @if (e.refusalCode) {
            <div>
              <dt class="text-caption text-gefinc-muted">Motivo da recusa</dt>
              <dd data-testid="detail-refusal">{{ e.refusalCode }}</dd>
            </div>
          }
          @if (e.subject) {
            <div>
              <dt class="text-caption text-gefinc-muted"> Assunto / recurso</dt>
              <dd data-testid="detail-subject">{{ e.subject }}</dd>
            </div>
          }
          @if (e.reason) {
            <div class="sm:col-span-2">
              <dt class="text-caption text-gefinc-muted">Justificativa informada</dt>
              <dd data-testid="detail-reason">{{ e.reason }}</dd>
            </div>
          }
          @if (detailPairs(e).length > 0) {
            <div class="sm:col-span-2">
              <dt class="text-caption text-gefinc-muted">Dados alterados (resumo)</dt>
              <dd data-testid="detail-changes">
                <ul class="mt-1 flex flex-wrap gap-2">
                  @for (pair of detailPairs(e); track pair.key) {
                    <li class="rounded border border-gefinc-border px-2 py-0.5 text-caption" data-testid="detail-change-item">
                      <span class="text-gefinc-muted">{{ pair.label }}: </span><strong class="text-gefinc-text">{{ pair.value }}</strong>
                    </li>
                  }
                </ul>
              </dd>
            </div>
          }
          @if (e.client; as c) {
            <div class="sm:col-span-2" data-testid="detail-client">
              <dt class="text-caption text-gefinc-muted">Origem da tentativa</dt>
              <dd class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption">
                <span data-testid="detail-client-ref">Referência: <strong class="text-gefinc-text">{{ c.ref }}</strong></span>
                @if (c.ip) {
                  <span data-testid="detail-client-ip">IP: <strong class="text-gefinc-text">{{ c.ip }}</strong></span>
                }
                @if (c.device) {
                  <span data-testid="detail-client-device">Dispositivo: <strong class="text-gefinc-text">{{ c.device }}</strong></span>
                }
              </dd>
            </div>
          }
        </dl>
      }
    </div>
  `,
})
export class AuditDetail implements OnInit, OnDestroy {
  private readonly api = inject(AdminApi);

  readonly auditId = input.required<number>();
  readonly initial = input<AuditEntry | null>(null);

  protected readonly entry = signal<AuditEntry | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loadOffline = signal(false);

  private request: Subscription | null = null;

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }

  protected load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.loadError.set(null);
    this.request = this.api.getAuditEntry(this.auditId()).subscribe({
      next: (full) => {
        this.entry.set(full);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        const problem = toProblem(error);
        this.loadOffline.set(isOfflineProblem(problem));
        this.loadError.set(messageFor(problem));
        this.loading.set(false);
      },
    });
  }

  protected detailPairs(entry: AuditEntry): { key: string; label: string; value: string }[] {
    if (!entry.details) {
      return [];
    }
    return Object.entries(entry.details).map(([key, value]) => ({
      key,
      label: DETAIL_KEY_LABELS[key] ?? key,
      value: String(value),
    }));
  }
}
