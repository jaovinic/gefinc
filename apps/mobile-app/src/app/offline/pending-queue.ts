import { Injectable, computed, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { CacheCrypto } from './cache-crypto';
import { UserScope } from './user-scope';

export type PendingKind = 'CREATE_GROUP' | 'PAY' | 'UNPAY';
export type PendingState = 'PENDING' | 'SENDING' | 'REJECTED';

/** Operação feita sem conexão, à espera de ser enviada ao servidor. */
export interface PendingOp {
  /** Também é enviado como `Idempotency-Key`: garante registro único mesmo se o envio se repetir. */
  id: string;
  kind: PendingKind;
  path: string;
  body: unknown;
  createdAt: number;
  state: PendingState;
  /** Motivo da recusa do servidor, quando `REJECTED`. */
  error?: string;
  /** Descrição curta para a tela de pendências (nunca vai a logs). */
  label: string;
}

export type NewPendingOp = Omit<PendingOp, 'id' | 'state' | 'createdAt' | 'error'> & { id?: string };

const keyFor = (user: string) => `gefinc.pending-ops.${user}`;

/**
 * Fila durável (Capacitor Preferences, cifrada) das operações feitas sem conexão. Cada usuário tem a
 * sua; o envio é sequencial e na ordem em que foram feitas.
 */
@Injectable({ providedIn: 'root' })
export class PendingQueue {
  private readonly crypto = inject(CacheCrypto);
  private readonly scope = inject(UserScope);

  readonly ops = signal<PendingOp[]>([]);
  /** Operações ainda não enviadas (pendentes ou enviando). */
  readonly pendingCount = computed(() => this.ops().filter((o) => o.state !== 'REJECTED').length);
  readonly rejected = computed(() => this.ops().filter((o) => o.state === 'REJECTED'));

  /** Carrega a fila do usuário atual; o que ficou "enviando" quando o app fechou volta a pendente. */
  async load(): Promise<void> {
    const user = this.scope.id();
    if (!user) {
      this.ops.set([]);
      return;
    }
    const { value } = await Preferences.get({ key: keyFor(user) });
    if (!value) {
      this.ops.set([]);
      return;
    }
    try {
      const list = JSON.parse(await this.crypto.decrypt(value)) as PendingOp[];
      this.ops.set(list.map((o) => (o.state === 'SENDING' ? { ...o, state: 'PENDING' as const } : o)));
    } catch {
      // Chave perdida: a fila não pode ser lida.
      this.ops.set([]);
    }
  }

  async enqueue(input: NewPendingOp): Promise<PendingOp> {
    const op: PendingOp = { ...input, id: input.id ?? crypto.randomUUID(), state: 'PENDING', createdAt: Date.now() };
    this.ops.update((list) => [...list, op]);
    await this.persist();
    return op;
  }

  markSending(id: string): Promise<void> {
    return this.update(id, { state: 'SENDING' });
  }

  markPending(id: string): Promise<void> {
    return this.update(id, { state: 'PENDING' });
  }

  reject(id: string, error: string): Promise<void> {
    return this.update(id, { state: 'REJECTED', error });
  }

  async remove(id: string): Promise<void> {
    this.ops.update((list) => list.filter((o) => o.id !== id));
    await this.persist();
  }

  /** Volta a recusada para a fila; se o corpo mudou, a operação ganha uma chave nova. */
  async retry(id: string, newBody?: unknown): Promise<PendingOp> {
    const current = this.ops().find((o) => o.id === id);
    if (!current) {
      throw new Error('Operação não encontrada');
    }
    const changed = newBody !== undefined && JSON.stringify(newBody) !== JSON.stringify(current.body);
    const next: PendingOp = { ...current, id: changed ? crypto.randomUUID() : current.id, body: changed ? newBody : current.body, state: 'PENDING' };
    delete next.error;
    this.ops.update((list) => list.map((o) => (o.id === id ? next : o)));
    await this.persist();
    return next;
  }

  async discardAll(): Promise<void> {
    this.ops.set([]);
    const user = this.scope.id();
    if (user) {
      await Preferences.remove({ key: keyFor(user) });
    }
  }

  private async update(id: string, patch: Partial<PendingOp>): Promise<void> {
    this.ops.update((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    await this.persist();
  }

  private async persist(): Promise<void> {
    const user = this.scope.id();
    if (!user) {
      return;
    }
    if (this.ops().length === 0) {
      await Preferences.remove({ key: keyFor(user) });
      return;
    }
    await Preferences.set({ key: keyFor(user), value: await this.crypto.encrypt(JSON.stringify(this.ops())) });
  }
}
