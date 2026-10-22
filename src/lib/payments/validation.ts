import { z } from 'zod';
import { bagSchema } from '../bag.ts';
import { locationNumberSchema, numberPlateSchema } from '../service-ordering.ts';

export const checkoutSchema = z.object({
  key: z.guid(), slotId: z.guid().optional(), eventId: z.guid().optional(),
  locationNumber: locationNumberSchema.optional(), numberPlate: numberPlateSchema.optional(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(3).max(30).regex(/^[+\d\s()\-]+$/),
  note: z.string().trim().max(1000),
  expectedTotal: z.number().int().min(30).max(10020000),
  lines: bagSchema.shape.lines.min(1).max(50),
}).strict().refine((input) => Boolean(input.slotId || (input.eventId && input.locationNumber)), 'Choose a pickup time or enter your table/car location.');

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutResult = { url?: string; orderId?: string; error?: string };