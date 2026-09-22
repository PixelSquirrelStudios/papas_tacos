import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { AdminRow, Resource } from './resources';

export function formDefaults(resource: Resource, row: AdminRow = {}) {
  return Object.fromEntries(resource.fields.map((field) => {
    const stored = row[field.key];
    if (stored === null || stored === undefined) return [field.key, field.initial ?? (field.type === 'tags' ? [] : field.type === 'boolean' ? false : '')];
    if (field.type === 'money') return [field.key, Number(stored) / 100];
    if (field.type === 'datetime') return [field.key, formatInTimeZone(String(stored), 'Europe/London', "yyyy-MM-dd'T'HH:mm")];
    return [field.key, stored];
  }));
}

export function formPayload(resource: Resource, values: Record<string, unknown>) {
  return Object.fromEntries(resource.fields.map((field) => {
    const value = values[field.key];
    if (field.nullable && (value === '' || value === null)) return [field.key, null];
    if (field.type === 'datetime') {
      const date = fromZonedTime(String(value), 'Europe/London');
      if (Number.isNaN(date.getTime()) || formatInTimeZone(date, 'Europe/London', "yyyy-MM-dd'T'HH:mm") !== value) return [field.key, 'Invalid local time'];
      return [field.key, date.toISOString()];
    }
    if (field.type === 'money' || field.type === 'number') return [field.key, value === '' ? NaN : Number(value)];
    return [field.key, value];
  }));
}