import type { RunItem } from './runner';
import { ACCESS_LABELS } from './types';

function cell(value: string): string {
  // Quote when needed, and neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return `${rows.map((r) => r.map(cell).join(',')).join('\n')}\n`;
}

export function runReportCsv(items: readonly RunItem[]): string {
  const header = ['artifact', 'email', 'access', 'status', 'error', 'attempts', 'finished_at'];
  const rows = items.map((i) => [
    i.artifact.url,
    i.email,
    ACCESS_LABELS[i.access],
    i.status,
    i.error ?? '',
    String(i.attempts),
    i.finishedAt ? new Date(i.finishedAt).toISOString() : '',
  ]);
  return toCsv([header, ...rows]);
}
