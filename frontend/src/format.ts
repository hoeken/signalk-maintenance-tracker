import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Status } from './types';

dayjs.extend(relativeTime);

export const STATUS_LABEL: Record<Status, string> = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
  ok: 'OK',
  unknown: 'Unknown',
};

export const STATUS_COLOR: Record<Status, string> = {
  overdue: 'red',
  due_soon: 'yellow',
  ok: 'green',
  unknown: 'gray',
};

export function formatHours(hours: number | null | undefined): string {
  if (hours == null) return '—';
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded.toLocaleString()} h`;
}

/** Remaining runtime, signed: "80.5 h left" or "20 h over". */
export function formatRemainingHours(hours: number | null | undefined): string {
  if (hours == null) return '—';
  const abs = Math.round(Math.abs(hours) * 10) / 10;
  return hours < 0 ? `${abs.toLocaleString()} h over` : `${abs.toLocaleString()} h left`;
}

/** Remaining time from ms, signed: "in 2 months" / "3 days ago". */
export function formatRemainingTime(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return dayjs().add(ms, 'millisecond').fromNow();
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dayjs(iso).format('YYYY-MM-DD');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dayjs(iso).format('YYYY-MM-DD HH:mm');
}

export function formatInterval(
  runtimeInterval: number | null,
  timeInterval: number | null,
  timeUnit: string | null
): string {
  const parts: string[] = [];
  if (runtimeInterval != null) parts.push(`every ${runtimeInterval.toLocaleString()} h`);
  if (timeInterval != null && timeUnit) {
    const unit = timeInterval === 1 ? timeUnit.replace(/s$/, '') : timeUnit;
    parts.push(`every ${timeInterval} ${unit}`);
  }
  return parts.length ? parts.join(' / ') : 'informational';
}
