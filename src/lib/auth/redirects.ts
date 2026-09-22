const fallbackPath = '/account';

export function safeReturnPath(value?: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) {
    return fallbackPath;
  }
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return fallbackPath;

  try {
    const origin = 'https://papas-tacos.invalid';
    const destination = new URL(value, origin);
    const decodedPath = decodeURIComponent(destination.pathname);
    if (destination.origin !== origin || /[\\\u0000-\u0020\u007f]/.test(decodedPath) || decodedPath.startsWith('//')) {
      return fallbackPath;
    }
    if (/^\/(auth|login)(\/|$)/.test(decodedPath)) return fallbackPath;
    return destination.pathname + destination.search + destination.hash;
  } catch {
    return fallbackPath;
  }
}

export function signedInPath(value: unknown, role?: string | null): string {
  const path = safeReturnPath(value);
  const pathname = decodeURIComponent(new URL(path, 'https://papas-tacos.invalid').pathname);
  if (role === 'admin' && pathname === '/account') return '/admin';
  if (role !== 'admin' && /^\/admin(\/|$)/.test(pathname)) return '/account';
  return path;
}

export function appOrigin(configuredOrigin: string | undefined, requestOrigin: string, production: boolean): string {
  if (production && !configuredOrigin) throw new Error('SITE_URL is required in production.');
  const origin = new URL(configuredOrigin || requestOrigin);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('SITE_URL must be an origin without a path or credentials.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local && !production)) {
    throw new Error('A secure site origin is required.');
  }
  if (!configuredOrigin && !local) throw new Error('Configure SITE_URL for non-local development.');
  return origin.origin;
}