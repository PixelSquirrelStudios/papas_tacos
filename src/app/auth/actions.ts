'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { appOrigin, safeReturnPath } from '@/lib/auth/redirects';
import { loginSchema, type AuthFormState } from '@/lib/auth/validation';
import { canRequestMagicLink } from '@/lib/auth/maintenance-sign-in';

async function authOrigin() {
  const requestHeaders = await headers();
  const requestOrigin = requestHeaders.get('origin') || `http://${requestHeaders.get('host')}`;
  return appOrigin(process.env.SITE_URL, requestOrigin, process.env.NODE_ENV === 'production');
}

export async function requestMagicLink(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = loginSchema.safeParse({
    email: String(formData.get('email') || '').trim(),
    mode: formData.get('mode'),
    fullName: String(formData.get('fullName') || ''),
  });
  if (!values.success) return { status: 'error', message: values.error.issues[0].message };
  try {
    if (!await canRequestMagicLink(values.data.email)) {
      return { status: 'error', message: 'Sign-in is restricted to administrators while the site is undergoing maintenance.' };
    }
    const origin = await authOrigin();
    const returnTo = safeReturnPath(String(formData.get('next') || ''));
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: values.data.email,
      options: {
        shouldCreateUser: values.data.mode === 'signup',
        emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(returnTo)}`,
        ...(values.data.mode === 'signup' ? { data: { full_name: values.data.fullName } } : {}),
      },
    });
    if (error && !['user_not_found', 'signup_disabled', 'otp_disabled'].includes(error.code || '')) {
      return { status: 'error', message: 'We could not send a link right now. Please wait a minute and try again.' };
    }
    return { status: 'success', message: 'If this address is eligible, a sign-in link will arrive shortly. Check your inbox and spam folder.' };
  } catch {
    return { status: 'error', message: 'Sign-in is temporarily unavailable. Please try again shortly.' };
  }
}

export async function signInWithGoogle(formData: FormData) {
  const returnTo = safeReturnPath(String(formData.get('next') || ''));
  let destination: string | undefined;
  try {
    const origin = await authOrigin();
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(returnTo)}` },
    });
    if (!error) destination = data.url;
  } catch {
    destination = undefined;
  }
  redirect(destination || `/sign-in?error=google_unavailable&next=${encodeURIComponent(returnTo)}`);
}

export async function signOut() {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) redirect('/account?error=signout');
  revalidatePath('/', 'layout');
  redirect('/');
}