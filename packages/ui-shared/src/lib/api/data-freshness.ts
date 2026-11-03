import { InjectionToken, Signal, signal } from '@angular/core';

/**
 * De quando são os dados que as telas acabaram de receber: a data da última sincronização quando vieram da
 * cópia guardada no aparelho (sem conexão), ou `null` quando vieram do servidor. O app móvel fornece; no web
 * os dados são sempre atuais.
 */
export const DATA_FRESHNESS = new InjectionToken<Signal<Date | null>>('DATA_FRESHNESS', {
  providedIn: 'root',
  factory: () => signal<Date | null>(null),
});

const two = (n: number) => String(n).padStart(2, '0');

/** `dd/MM HH:mm`, no horário do aparelho. */
export function formatSyncedAt(date: Date): string {
  return `${two(date.getDate())}/${two(date.getMonth() + 1)} ${two(date.getHours())}:${two(date.getMinutes())}`;
}
