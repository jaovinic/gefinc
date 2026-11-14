import type { AdminRole } from '@gefinc/core-models';

/** Selo de situação: texto e ícone (nunca só cor) mais as classes de cor. */
export interface StatusBadge {
  label: string;
  icon: string;
  tone: string;
}

/** Situação da conta em selos: suspensa, aguardando exclusão (podem coexistir) ou ativa. */
export function statusBadges(account: { suspended: boolean; deletionPending: boolean }): StatusBadge[] {
  const badges: StatusBadge[] = [];
  if (account.suspended) {
    badges.push({ label: 'Suspenso', icon: 'alert', tone: 'border-gefinc-danger/40 text-gefinc-danger' });
  }
  if (account.deletionPending) {
    badges.push({ label: 'Aguardando exclusão', icon: 'clock', tone: 'border-gefinc-warning/40 text-gefinc-warning' });
  }
  if (badges.length === 0) {
    badges.push({ label: 'Ativo', icon: 'check', tone: 'border-gefinc-primary/40 text-gefinc-primary' });
  }
  return badges;
}

export function roleLabel(role: AdminRole): string {
  switch (role) {
    case 'ROOT':
      return 'Administrador raiz';
    case 'ADMIN':
      return 'Administrador';
    default:
      return 'Usuário';
  }
}
