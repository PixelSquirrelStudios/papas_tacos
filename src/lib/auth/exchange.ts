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
      return !error;
    }
    if (tokenHash && tokenHash.length <= 4096 && params.get('type') === 'email') {
      const { error } = await auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      return !error;
    }
  } catch {
    return false;
  }
  return false;
}