import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { API_BASE_URL, CLIENT_KIND } from '@gefinc/ui-shared';
import { MaintenanceBanner } from './maintenance-banner';
import { NewPendingOp, PENDING_SCHEMA, PendingOp, PendingQueue } from '../offline/pending-queue';
import { SyncEngine } from '../offline/sync-engine';
import { NetworkStatus } from '../offline/network-status';

class FakeQueue {
  readonly ops = signal<PendingOp[]>([]);
  private seq = 0;

  async enqueue(input: NewPendingOp): Promise<string> {
    const id = input.id ?? `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`;
    const op: PendingOp = {
      ...input,
      method: input.method ?? 'POST',
      schema: PENDING_SCHEMA,
      id,
      state: 'PENDING',
      createdAt: this.seq,
    };
    this.ops.update((list) => [...list, op]);
    return id;
  }

  private set(id: string, patch: Partial<PendingOp>): void {
    this.ops.update((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  async markSending(id: string): Promise<void> {
    this.set(id, { state: 'SENDING' });
  }

  async markPending(id: string): Promise<void> {
    this.set(id, { state: 'PENDING' });
  }

  async reject(id: string, error: string): Promise<void> {
    this.set(id, { state: 'REJECTED', error });
  }

  async remove(id: string): Promise<void> {
    this.ops.update((list) => list.filter((o) => o.id !== id));
  }
}

describe('MaintenanceBanner', () => {
  let fixture: ComponentFixture<MaintenanceBanner>;
  let component: MaintenanceBanner;
  let http: HttpTestingController;
  const online = signal(true);

  beforeEach(async () => {
    online.set(true);
    await TestBed.configureTestingModule({
      imports: [MaintenanceBanner],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api/v1' },
        { provide: CLIENT_KIND, useValue: 'mobile' },
        { provide: PendingQueue, useClass: FakeQueue },
        { provide: NetworkStatus, useValue: { online } },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MaintenanceBanner);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    http.verify();
  });

  it('não exibe faixa quando o sistema não está em manutenção', () => {
    fixture.detectChanges();

    const req = http.expectOne('/api/v1/system/status');
    req.flush({ maintenance: false, signupsOpen: true });
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('[data-testid="maintenance-banner"]');
    expect(banner).toBeNull();
    expect(component.maintenance()).toBe(false);
  });

  it('exibe faixa com a mensagem quando em manutenção', () => {
    fixture.detectChanges();

    const req = http.expectOne('/api/v1/system/status');
    req.flush({ maintenance: true, message: 'Janela de manutenção programada', signupsOpen: false });
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('[data-testid="maintenance-banner"]');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Sistema em manutenção');
    expect(banner.textContent).toContain('Janela de manutenção programada');
    expect(component.maintenance()).toBe(true);
  });

  it('preserva a fila offline quando o servidor responde 503 manutenção (nada é descartado)', async () => {
    fixture.detectChanges();
    http.expectOne('/api/v1/system/status').flush({ maintenance: true, message: 'Sistema em manutenção' });
    const queue = TestBed.inject(PendingQueue) as unknown as FakeQueue;
    const engine = TestBed.inject(SyncEngine);

    // Adiciona uma operação de lançamento na fila offline
    const opId = await queue.enqueue({
      kind: 'CREATE_GROUP',
      path: '/transaction-groups',
      method: 'POST',
      body: { totalAmount: '150.00', description: 'Mercado' },
    });

    expect(queue.ops()).toHaveLength(1);
    expect(queue.ops()[0].state).toBe('PENDING');

    // Executa flush do sync-engine simulando rede ativa
    const syncPromise = engine.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Servidor responde 503 MAINTENANCE
    const syncReq = http.expectOne('/api/v1/transaction-groups');
    syncReq.flush(
      { code: 'MAINTENANCE', message: 'Sistema em manutenção' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    const result = await syncPromise;

    // A sincronização parou para retry e NÃO descartou a operação
    expect(result.stopped).toBe('retry');
    expect(result.sent).toBe(0);
    expect(result.rejected).toBe(0);

    // A operação continua na fila offline para ser tentada depois
    expect(queue.ops()).toHaveLength(1);
    expect(queue.ops()[0].id).toBe(opId);
    expect(queue.ops()[0].state).toBe('PENDING');
  });
});
