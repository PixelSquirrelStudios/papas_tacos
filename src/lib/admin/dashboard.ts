import { z } from 'zod';

const row = z.object({ id: z.string().optional(), updated_at: z.string().optional() }).catchall(z.unknown());

export const dashboardSnapshotSchema = z.object({
  orders: z.array(row),
  menu: z.array(row),
  events: z.array(row),
  settings: row.optional(),
});

export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;
