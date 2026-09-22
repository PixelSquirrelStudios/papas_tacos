'use server';

import { revalidatePath } from 'next/cache';
import { requireAccount } from '@/lib/auth/session';
import { createServerSupabase } from '@/lib/supabase/server';
import { profileSchema, type AuthFormState } from '@/lib/auth/validation';

export async function updateProfile(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const viewer = await requireAccount();
  const values = profileSchema.safeParse({ fullName: formData.get('fullName'), phone: formData.get('phone') });
  if (!values.success) return { status: 'error', message: values.error.issues[0].message };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from('profiles')
    .update({ full_name: values.data.fullName, phone: values.data.phone || null })
    .eq('id', viewer.user.id).select('id').maybeSingle();
  if (error || !data) return { status: 'error', message: 'Your details could not be saved. Please try again.' };
  revalidatePath('/account');
  return { status: 'success', message: 'Your details have been updated.' };
}