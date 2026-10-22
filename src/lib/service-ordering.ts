import { z } from 'zod';

export const serviceModeSchema = z.enum(['pickup', 'table', 'car']);
export type ServiceMode = z.infer<typeof serviceModeSchema>;
export const locationNumberSchema = z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9 /-]+$/, 'Use letters, numbers, spaces, / or -.');
export const numberPlateSchema = z.string().trim().max(20).regex(/^[a-zA-Z0-9 -]*$/, 'Enter a valid number plate.').transform((value) => value.toUpperCase());

export function serviceMode(location: unknown): ServiceMode {
  if (typeof location !== 'object' || location === null || !('service_mode' in location)) return 'pickup';
  return serviceModeSchema.parse(location.service_mode);
}

export function deliveryLabel(location: unknown) {
  const mode = serviceMode(location);
  if (mode === 'pickup' || typeof location !== 'object' || location === null) return '';
  const number = 'location_number' in location ? String(location.location_number ?? '') : '';
  const plate = 'number_plate' in location ? String(location.number_plate ?? '') : '';
  return `${mode === 'table' ? 'Table' : 'Car'} ${number}${plate ? ` / ${plate}` : ''}`;
}

export function orderStatusLabel(status: string, location: unknown) {
  if (serviceMode(location) !== 'pickup' && status === 'collected') return 'Complete';
  return status.replaceAll('_', ' ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function eventMenuLink(eventId: string) {
  return `/menu?event=${encodeURIComponent(eventId)}`;
}

export function serviceDeliveryMessage(mode: 'car' | 'table') {
  return `We aim to bring your food to your ${mode} as soon as possible. Delivery times may be longer during busy periods. Please stay at your assigned ${mode} while you wait.`;
}
