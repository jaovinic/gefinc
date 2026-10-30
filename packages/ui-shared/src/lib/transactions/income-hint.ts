import { isoToBR } from '@gefinc/utils';

/** Dica sob a data da receita: entra hoje, entra na data informada (passada) ou fica a receber até a data. */
export function incomeDateHint(date: string, today: string): string {
  if (!date) {
    return '';
  }
  if (date === today) {
    return 'Entra na conta hoje';
  }
  return date < today ? 'Entra na conta na data informada' : `Fica a receber até ${isoToBR(date)}`;
}
