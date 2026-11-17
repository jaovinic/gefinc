const TIME_ZONE = 'America/Sao_Paulo';

const formatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Data e hora do painel em `dd/mm/aaaa hh:mm`, sempre no horário de Brasília (America/Sao_Paulo). */
export function formatAdminDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return formatter.format(date).replace(', ', ' ');
}
