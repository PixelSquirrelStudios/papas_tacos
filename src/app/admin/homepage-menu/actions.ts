'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { adminError, adminRequest, AdminDataError } from '@/lib/admin/data';
import type { AdminResult } from '@/app/admin/actions';

const selectionSchema = z.object({
  papasChoiceIds: z.array(z.guid()).max(3),
  crowdFavouriteIds: z.array(z.guid()).max(3),
  updatedAt: z.iso.datetime({ offset: true }),
}).superRefine(({ papasChoiceIds, crowdFavouriteIds }, context) => {
  if (new Set(papasChoiceIds).size !== papasChoiceIds.length || new Set(crowdFavouriteIds).size !== crowdFavouriteIds.length) {
    context.addIssue({ code: 'custom', message: 'Choose each item only once.' });
  }
  if (papasChoiceIds.some((id) => crowdFavouriteIds.includes(id))) {
    context.addIssue({ code: 'custom', message: 'An item can appear in only one homepage section.' });
  }
});

export async function saveHomepageFeaturedMenu(input: unknown): Promise<AdminResult> {
  await requireAdmin();
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Check the homepage menu selections.' };
  try {
    const { papasChoiceIds, crowdFavouriteIds, updatedAt } = parsed.data;
    const saved = await adminRequest('rpc/admin_save_homepage_featured_menu', {}, 'POST', {
      expected_version: updatedAt,
      papas_choice_ids: papasChoiceIds,
      crowd_favourite_ids: crowdFavouriteIds,
    });
    if (saved.length !== 1) throw new AdminDataError('CONFLICT', 'Homepage menu settings changed. Refresh and try again.');
    if (typeof saved[0].updated_at !== 'string') throw new AdminDataError('DATA', 'Homepage menu was saved, but its version could not be refreshed. Reload before editing again.');
    revalidatePath('/');
    revalidatePath('/admin/homepage-menu');
    return { ok: true, updatedAt: saved[0].updated_at };
  } catch (error) { return { ok: false, error: adminError(error) }; }
}
