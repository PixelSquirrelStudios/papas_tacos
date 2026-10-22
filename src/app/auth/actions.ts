'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { appOrigin, safeReturnPath, signedInPath } from '@/lib/auth/redirects';
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
    password: String(formData.get('password') || ''),
  });
  if (!values.success) return { status: 'error', message: values.error.issues[0].message };
  let destination: string;
  try {
    if (!await canRequestMagicLink(values.data.email)) {
      return { status: 'error', message: 'Sign-in is restricted to administrators while the site is undergoing maintenance.' };
    }
    const origin = await authOrigin();
    const returnTo = safeReturnPath(String(formData.get('next') || ''));
    const supabase = await createServerSupabase();
    if (values.data.mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: values.data.email,
        password: values.data.password,
        options: {
          data: { full_name: values.data.fullName },
          emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(returnTo)}`,
        },
      });
      if (error) {
        console.error('[auth] Signup failed', { code: error.code, status: error.status });
        return { status: 'error', message: error.code === 'weak_password'
          ? 'Choose a stronger password with a mix of letters, numbers and symbols.'
          : 'We could not create your account. If you already have an account, choose Sign In. Otherwise, please try again shortly.' };
      }
      if (!data.session) {
        console.warn('[auth] Signup returned no session; check email confirmation settings or existing account.');
        return { status: 'error', message: 'Your account is not signed in. If you already have an account, choose Sign In. If a confirmation email has arrived, use it to finish creating your account.' };
      }
      destination = signedInPath(returnTo, 'customer');
    } else if (formData.get('loginMethod') === 'password') {
      if (!values.data.password) return { status: 'error', message: 'Enter your password.' };
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.data.email, password: values.data.password,
      });
      if (error || !data.session) {
        console.warn('[auth] Password sign-in failed', { code: error?.code, status: error?.status });
        return { status: 'error', message: 'We could not sign you in with those details. Try again or use an email sign-in link.' };
      }
      const { data: profile, error: profileError } = await supabase.from('profiles')
        .select('role').eq('id', data.session.user.id).maybeSingle();
      if (profileError) console.error('[auth] Unable to resolve sign-in role', { code: profileError.code });
      destination = signedInPath(returnTo, profileError ? undefined : profile?.role);
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email: values.data.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(returnTo)}`,
        },
      });
      if (error && !['user_not_found', 'signup_disabled', 'otp_disabled'].includes(error.code || '')) {
        console.error('[auth] Magic-link request failed', { code: error.code, status: error.status });
        return { status: 'error', message: 'We could not send a link right now. Please wait a minute and try again.' };
      }
      return { status: 'success', message: 'If this address is eligible, a sign-in link will arrive shortly. Check your inbox and spam folder.' };
    }
  } catch {
    console.error('[auth] Email authentication unavailable.');
    return { status: 'error', message: 'Sign-in is temporarily unavailable. Please try again shortly.' };
  }
  revalidatePath('/', 'layout');
  redirect(destination);
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