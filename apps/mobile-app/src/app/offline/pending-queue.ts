import { Injectable, computed, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { CacheCrypto } from './cache-crypto';
import { UserScope } from './user-scope';

export type PendingKind = 'CREATE_GROUP' | 'PAY' | 'UNPAY' | 'EDIT_TX' | 'EDIT_GROUP' | 'DELETE_GROUP';
export type PendingMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type PendingState = 'PENDING' | 'SENDING' | 'REJECTED';

/** Formato atual da fila gravada (1 = só POST, sem verbo nem entidade). */
export const PENDING_SCHEMA = 2;

/** O registro do servidor que a operação altera; serve para manter a ordem e ajustar a `version` das edições seguintes. */
export interface PendingEntity {
  type: 'TRANSACTION' | 'GROUP';
  id: number;
}

/** Operação feita sem conexão, à espera de ser enviada ao servidor. */
export interface PendingOp {
  /** Também é enviado como `Idempotency-Key`: garante registro único mesmo se o envio se repetir. */
  id: string;
  kind: PendingKind;
  method: PendingMethod;
  path: string;
  body: unknown;
  createdAt: number;
  state: PendingState;
  /** Motivo da recusa do servidor, quando `REJECTED`. */
  error?: string;
  /** Descrição curta para a tela de pendências (nunca vai a logs). */
  label: string;
  /** Ausente em criação de lançamento (ainda não existe no servidor). */
  entity?: PendingEntity;
  /** A requisição já saiu para o servidor ao menos uma vez (que pode tê-la aplicado sem a resposta chegar). */
  attempted?: boolean;
  schema: number;
}

export type NewPendingOp = Omit<PendingOp, 'id' | 'state' | 'createdAt' | 'error' | 'method' | 'schema'> & {
  id?: string;
  method?: PendingMethod;
};

const sameEntity = (a?: PendingEntity, b?: PendingEntity): boolean => !!a && !!b && a.type === b.type && a.id === b.id;
const isEdit = (kind: PendingKind): boolean => kind === 'EDIT_TX' || kind === 'EDIT_GROUP';
const versionOf = (body: unknown): number | undefined => (body as { version?: number } | null)?.version;

/**
 * A `version` devolvida pelo servidor só é herdada pela edição seguinte se for exatamente a que ela guarda +1 (cada
 * operação nossa soma 1). Qualquer salto indica alteração feita em outro aparelho no meio: a edição segue com a
 * version velha, leva `409 STALE_VERSION` e vai para as pendências, em vez de sobrescrever em silêncio.
 */
export const followsVersion = (stored: number | undefined, response: number): boolean => stored !== undefined && response === stored + 1;

/** Fila gravada por versões anteriores do app: sem verbo, sem formato e sem entidade. */
function normalize(op: PendingOp): PendingOp {
  const pay = /^\/transactions\/(\d+)\/(pay|unpay)$/.exec(op.path);
  return {
    ...op,
    method: op.method ?? 'POST',
    schema: PENDING_SCHEMA,
    ...(op.entity || !pay ? {} : { entity: { type: 'TRANSACTION' as const, id: Number(pay[1]) } }),
    // O que ficou "enviando" quando o app fechou pode ter chegado ao servidor.
    ...(op.state === 'SENDING' ? { state: 'PENDING' as const, attempted: true } : {}),
  };
}

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
      this.ops.set(list.map(normalize));
    } catch {
      // Chave perdida: a fila não pode ser lida.
      this.ops.set([]);
    }
  }

  /**
   * Põe a operação no fim da fila. Edição que segue outra edição do mesmo registro, esta ainda não enviada e
   * a última do registro na fila, é unida a ela: a nova substitui o corpo (mantendo a `version` que a fila
   * já guarda) e a chave original fica, pois nunca saiu para o servidor.
   */
  async enqueue(input: NewPendingOp): Promise<PendingOp> {
    const merged = this.mergeInto(input);
    if (merged) {
      this.ops.update((list) => list.map((o) => (o.id === merged.id ? merged : o)));
      await this.persist();
      return merged;
    }
    const op: PendingOp = {
      ...input,
      method: input.method ?? 'POST',
      id: input.id ?? crypto.randomUUID(),
      schema: PENDING_SCHEMA,
      state: 'PENDING',
      createdAt: Date.now(),
    };
    this.ops.update((list) => [...list, op]);
    await this.persist();
    return op;
  }

  /** Há operação ainda não enviada (pendente ou enviando) para o registro. */
  hasLive(entity: PendingEntity): boolean {
    return this.ops().some((o) => o.state !== 'REJECTED' && sameEntity(o.entity, entity));
  }

  /**
   * O servidor devolveu a nova `version` do registro: as edições seguintes dele, ainda pendentes, passam a
   * usá-la, desde que ela seja a que guardam +1 (`followsVersion`); com salto, ficam como estão e o servidor as recusa.
   * Uma que já tinha saído (corpo muda) ganha chave nova, para o servidor não ver a mesma chave com outro corpo.
   */
  async rewriteVersion(entity: PendingEntity, version: number): Promise<void> {
    let changed = false;
    const next = this.ops().map((o) => {
      if (!isEdit(o.kind) || o.state !== 'PENDING' || !sameEntity(o.entity, entity) || !followsVersion(versionOf(o.body), version)) {
        return o;
      }
      changed = true;
      const body = { ...(o.body as object), version };
      return o.attempted ? { ...o, body, id: crypto.randomUUID(), attempted: false } : { ...o, body };
    });
    if (changed) {
      this.ops.set(next);
      await this.persist();
    }
  }

  private mergeInto(input: NewPendingOp): PendingOp | null {
    if (!isEdit(input.kind) || !input.entity || input.attempted) {
      return null;
    }
    const last = [...this.ops()].reverse().find((o) => o.state !== 'REJECTED' && sameEntity(o.entity, input.entity));
    if (!last || last.kind !== input.kind || last.state !== 'PENDING' || last.attempted) {
      return null;
    }
    const kept = versionOf(last.body);
    const body = kept === undefined ? input.body : { ...(input.body as object), version: kept };
    return { ...last, body, label: input.label };
  }

  markSending(id: string): Promise<void> {
    return this.update(id, { state: 'SENDING', attempted: true });
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

  /**
   * Volta a recusada para a fila com uma chave nova: a recusa (4xx) é definitiva e o servidor a guarda por 7 dias sob
   * a chave antiga, então repetir a mesma chave só devolveria a mesma recusa. Se o corpo mudou, o novo vale.
   */
  async retry(id: string, newBody?: unknown): Promise<PendingOp> {
    const current = this.ops().find((o) => o.id === id);
    if (!current) {
      throw new Error('Operação não encontrada');
    }
    if (current.state !== 'REJECTED') {
      throw new Error('Só uma operação recusada pode ser reenviada com chave nova');
    }
    const next: PendingOp = {
      ...current,
      id: crypto.randomUUID(),
      body: newBody !== undefined ? newBody : current.body,
      attempted: false,
      state: 'PENDING',
    };
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
