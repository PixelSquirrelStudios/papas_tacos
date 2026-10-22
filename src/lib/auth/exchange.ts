import type { SupabaseClient } from '@supabase/supabase-js';

type AuthExchange = Pick<SupabaseClient['auth'], 'exchangeCodeForSession' | 'verifyOtp'>;

export async function exchangeCredentials(auth: AuthExchange, params: URLSearchParams): Promise<boolean> {
  if (params.has('error') || params.has('error_code')) return false;
  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  if (code && tokenHash) return false;
  try {
    if (code && code.length <= 4096) {
      const { error } = await auth.exchangeCodeForSession(code);
      if (error) console.warn('[auth] Code exchange rejected', { code: error.code, status: error.status });
      return !error;
    }
    const type = params.get('type');
    if (tokenHash && tokenHash.length <= 4096 && (type === 'email' || type === 'signup' || type === 'magiclink')) {
      const { error } = await auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) console.warn('[auth] Email token rejected', { code: error.code, status: error.status });
      return !error;
    }
  } catch {
    console.error('[auth] Credential exchange unavailable.');
    return false;
  }
  return false;
}