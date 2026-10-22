'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { adminError, adminRequest } from '@/lib/admin/data';
import { menuSetInputSchema } from '@/lib/catalogue/menu-sets';
import type { AdminResult } from '@/app/admin/actions';

export async function saveMenuSet(input: unknown): Promise<AdminResult> {
  await requireAdmin();
  const parsed = menuSetInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Check your menu set.' };
  try {
    const { id, updatedAt, name, sections } = parsed.data;
    const result = await adminRequest('rpc/admin_save_menu_set', {}, 'POST', { set_uuid: id, expected_version: updatedAt, set_name: name, sections });
    if (result.length !== 1 || !result[0].id) return { ok: false, error: 'The menu set could not be saved. Refresh and try again.' };
    revalidatePath('/admin/menu-sets');
    revalidatePath('/menu');
    revalidatePath('/');
    return { ok: true, id: result[0].id };
  } catch (error) { return { ok: false, error: adminError(error) }; }
}
