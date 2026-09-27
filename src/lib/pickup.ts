import { z } from 'zod';

export const pickupChoiceSchema = z.object({
  id: z.guid(), event_id: z.guid(), starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }), event_title: z.string(), venue_name: z.string(),
  status: z.enum(['available', 'taken', 'locked', 'unavailable']),
});
export const pickupChoicesSchema = z.array(pickupChoiceSchema).max(10000);
export type PickupChoice = z.infer<typeof pickupChoiceSchema>;

export function pickupLabel(status: PickupChoice['status']) {
  return { available: 'Available', taken: 'Taken', locked: 'Locked', unavailable: 'Unavailable' }[status];
}