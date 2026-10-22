import assert from 'node:assert/strict';
import test from 'node:test';
import { appOrigin, safeReturnPath, signedInPath } from '../src/lib/auth/redirects.ts';
import { exchangeCredentials } from '../src/lib/auth/exchange.ts';
import { loginSchema, profileSchema } from '../src/lib/auth/validation.ts';
import { build } from 'esbuild';
import { NextRequest } from 'next/server.js';

test('maintenance rejects non-admin email and Google sign-ins and ends their sessions', async () => {
  const state = { enabled: true, sent: 0, signedOut: 0, email: 'customer@example.test', role: 'customer' };
  globalThis.__maintenanceSignIn = state;
  const originalOrigin = process.env.SITE_URL;
  const originalSecret = process.env.SUPABASE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  process.env.SITE_URL = 'https://tacos.example';
  process.env.SUPABASE_SECRET_KEY = 'fixture-secret';
  globalThis.fetch = async (url, options) => {
    assert.equal(url.pathname, '/rest/v1/profiles');
    assert.equal(url.searchParams.get('role'), 'eq.admin');
    assert.equal(url.searchParams.get('email'), `ilike."${state.email}"`);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.apikey, 'fixture-secret');
    return Response.json(state.role === 'admin' ? [{ email: state.email.toUpperCase(), role: state.role }] : []);
  };
  try {
    const modules = {};
    for (const [name, entry] of Object.entries({ actions: 'src/app/auth/actions.ts', callback: 'src/lib/auth/callback.ts', session: 'src/lib/auth/session.ts' })) {
      const bundle = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'signin-boundaries', setup(builder) {
        builder.onResolve({ filter: /^(server-only|react|next\/(server|headers|navigation|cache)|@\/lib\/supabase\/(server|config)|@\/lib\/catalogue\/data)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => {
          let contents = '';
          if (args.path === 'react') contents = 'export const cache = (operation) => operation;';
          else if (args.path === 'next/server') contents = `export { NextResponse } from ${JSON.stringify(new URL('../node_modules/next/server.js', import.meta.url).href)};`;
          else if (args.path === 'next/headers') contents = 'export async function headers() { return new Headers({origin: "https://tacos.example"}); }';
          else if (args.path === 'next/navigation') contents = 'export function redirect(path) { throw new Error(path); } export function notFound() { throw new Error("Not found"); }';
          else if (args.path === 'next/cache') contents = 'export function revalidatePath() {}';
          else if (args.path.endsWith('/data')) contents = 'export async function getMaintenanceMode() { return globalThis.__maintenanceSignIn.enabled; }';
          else if (args.path.endsWith('/config')) contents = 'export function supabaseConfig() { return { url: "https://example.test" }; }';
          else if (args.path.endsWith('/server')) contents = `export async function createServerSupabase() { const state = globalThis.__maintenanceSignIn; return {
            auth: {
              signInWithOtp: async () => { state.sent++; return {}; },
              exchangeCodeForSession: async () => ({ error: null }), verifyOtp: async () => ({ error: null }),
              getUser: async () => ({ data: { user: { id: 'user', email: state.email } }, error: null }),
              signOut: async () => { state.signedOut++; return {}; },
            },
            from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: state.role } }) }) }) }),
          }; }`;
          return { contents };
        });
        builder.onResolve({ filter: /^file:/ }, (args) => ({ path: args.path, external: true }));
      } }] });
      modules[name] = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    }
    const form = new FormData();
    form.set('email', state.email);
    form.set('mode', 'login');
    for (const mode of ['login', 'signup']) {
      form.set('mode', mode);
      form.set('fullName', 'Customer');
      form.set('password', 'A-long-password-123');
      const result = await modules.actions.requestMagicLink({}, form);
      assert.equal(result.status, 'error');
      assert.match(result.message, /restricted to administrators/);
    }
    form.set('mode', 'login');
    state.role = null;
    assert.equal((await modules.actions.requestMagicLink({}, form)).status, 'error');
    assert.equal(state.sent, 0);
    state.role = 'customer';
    assert.equal((await modules.session.getViewer()).profile.role, 'customer');
    for (const query of ['code=google-code', 'token_hash=old-email-link&type=email']) {
      const response = await modules.callback.completeSignIn(new NextRequest(`https://tacos.example/auth/callback?${query}`));
      assert.equal(response.headers.get('location'), 'https://tacos.example/sign-in?error=maintenance&next=%2Faccount');
    }
    assert.equal(state.signedOut, 2);
    for (const role of [null, 'customer']) {
      state.role = role;
      const response = await modules.callback.completeSignIn(new NextRequest('https://tacos.example/auth/callback?code=customer-code&next=/admin'));
      assert.equal(response.headers.get('location'), 'https://tacos.example/sign-in?error=maintenance&next=%2Fadmin');
    }
    state.enabled = false;
    assert.equal((await modules.actions.requestMagicLink({}, form)).status, 'success');
    assert.equal(state.sent, 1);
    assert.equal((await modules.callback.completeSignIn(new NextRequest('https://tacos.example/auth/callback?code=customer-code'))).headers.get('location'), 'https://tacos.example/account');
    state.enabled = true;
    state.role = 'admin';
    form.set('email', state.email.toUpperCase());
    assert.equal((await modules.actions.requestMagicLink({}, form)).status, 'success');
    assert.equal(state.sent, 2);
    delete process.env.SUPABASE_SECRET_KEY;
    assert.equal((await modules.actions.requestMagicLink({}, form)).status, 'error');
    process.env.SUPABASE_SECRET_KEY = 'fixture-secret';
    for (const failure of [
      async () => new Response('', { status: 503 }),
      async () => { throw new Error('Offline'); },
      async () => Response.json({ email: state.email, role: 'admin' }),
      async () => Response.json([{ email: state.email, role: 'customer' }]),
      async () => Response.json([{ email: 'someone-else@example.test', role: 'admin' }]),
    ]) {
      globalThis.fetch = failure;
      assert.equal((await modules.actions.requestMagicLink({}, form)).status, 'error');
    }
    assert.equal(state.sent, 2);
    assert.equal((await modules.session.getViewer()).profile.role, 'admin');
    const response = await modules.callback.completeSignIn(new NextRequest('https://tacos.example/auth/callback?code=allowed-code'));
    assert.equal(response.headers.get('location'), 'https://tacos.example/admin');
    assert.equal(state.signedOut, 4);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
    if (originalOrigin === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = originalOrigin;
    delete globalThis.__maintenanceSignIn;
  }
});

test('maintenance gates public routes without blocking admin, login, contact, or assets', async () => {
  const state = { enabled: true, reads: 0, signedOut: 0, signOutError: false, user: null, role: null, profileError: null, authError: null, profileThrows: false };
  globalThis.__maintenanceProxy = state;
  try {
    const result = await build({ entryPoints: ['src/proxy.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'proxy-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(@supabase\/ssr|@\/lib\/supabase\/config|@\/lib\/catalogue\/data|next\/server)$/ }, (args) => ({ path: args.path, namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({ contents: args.path === 'next/server'
        ? `export { NextResponse } from ${JSON.stringify(new URL('../node_modules/next/server.js', import.meta.url).href)};`
        : args.path === '@supabase/ssr' ? `export const createServerClient = (url, key, options) => ({
          auth: {
            getClaims: async () => { options.cookies.setAll([{ name: 'session', value: 'refreshed', options: { httpOnly: true, path: '/' } }]); return {}; },
            getUser: async () => ({ data: { user: globalThis.__maintenanceProxy.user }, error: globalThis.__maintenanceProxy.authError || (globalThis.__maintenanceProxy.user ? null : { name: 'AuthSessionMissingError' }) }),
            signOut: async ({ scope }) => {
              const state = globalThis.__maintenanceProxy;
              if (scope !== 'local') throw new Error('Expected local sign-out');
              if (state.signOutError) return { error: new Error('Offline') };
              state.signedOut++;
              state.user = null;
              options.cookies.setAll([{ name: 'session', value: '', options: { httpOnly: true, path: '/', maxAge: 0 } }]);
              return { error: null };
            },
          },
          from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
            const state = globalThis.__maintenanceProxy;
            if (state.profileThrows) throw new Error('Unavailable');
            return { data: state.role ? { role: state.role } : null, error: state.profileError };
          } }) }) }),
        });`
        : args.path.endsWith('/config') ? 'export const supabaseConfig = () => ({url: "https://example.test", key: "fixture"});'
        : 'export async function getMaintenanceMode() { globalThis.__maintenanceProxy.reads++; return globalThis.__maintenanceProxy.enabled; }' }));
      builder.onResolve({ filter: /^file:/ }, (args) => ({ path: args.path, external: true }));
    } }] });
    const { proxy } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    for (const pathname of ['/', '/menu', '/bag', '/events/example', '/contact', '/account/orders', '/admin', '/admin/settings', '/admin-fake', '/login-fake', '/sign-in-fake']) {
      const response = await proxy(new NextRequest(`https://tacos.example${pathname}?private=value`));
      assert.equal(response.status, 307);
      assert.equal(response.headers.get('location'), 'https://tacos.example/maintenance');
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(response.cookies.get('session')?.value, 'refreshed');
    }
    const reads = state.reads;
    for (const pathname of ['/sign-in', '/auth/callback', '/api/contact', '/api/catalogue', '/maintenance', '/_next/image', '/images/logo.svg']) {
      const response = await proxy(new NextRequest(`https://tacos.example${pathname}`));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('location'), null);
    }
    assert.equal(state.reads, reads + 1);
    state.enabled = false;
    assert.equal((await proxy(new NextRequest('https://tacos.example/menu'))).status, 200);
    state.enabled = null;
    assert.equal((await proxy(new NextRequest('https://tacos.example/menu'))).status, 307);
    const readsBeforeSignIn = state.reads;
    for (const enabled of [true, false, null]) {
      state.enabled = enabled;
      for (const pathname of ['/sign-in', '/sign-in/']) {
        const response = await proxy(new NextRequest(`https://tacos.example${pathname}?next=%2Fadmin%2Fsettings`));
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('location'), null);
        assert.match(response.headers.get('cache-control'), /no-store/);
      }
    }
    assert.equal(state.reads, readsBeforeSignIn + 6);
    state.enabled = true;
    state.user = { id: 'admin-user' };
    state.role = 'admin';
    for (const pathname of ['/', '/menu', '/events/example', '/contact', '/bag', '/account', '/admin', '/admin/settings']) {
      const response = await proxy(new NextRequest(`https://tacos.example${pathname}`));
      assert.equal(response.status, 200, pathname);
      assert.equal(response.cookies.get('session')?.value, 'refreshed');
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
    for (const role of ['customer', null]) {
      state.role = role;
      assert.equal((await proxy(new NextRequest('https://tacos.example/menu'))).status, 307);
      assert.equal((await proxy(new NextRequest('https://tacos.example/admin'))).headers.get('location'), 'https://tacos.example/maintenance');
    }
    state.role = 'admin';
    assert.equal((await proxy(new NextRequest('https://tacos.example/menu'))).status, 200);
    for (const failure of ['profileError', 'authError', 'profileThrows']) {
      state[failure] = true;
      assert.equal((await proxy(new NextRequest('https://tacos.example/menu'))).status, 307, failure);
      state[failure] = null;
    }
    state.user = null;
    assert.equal((await proxy(new NextRequest('https://tacos.example/menu'))).status, 307);
    for (const enabled of [true, null]) {
      state.enabled = enabled;
      for (const role of ['customer', null]) {
        state.user = { id: 'customer-user' };
        state.role = role;
        const response = await proxy(new NextRequest('https://tacos.example/sign-in?next=%2Fadmin'));
        assert.equal(response.status, 303);
        assert.equal(response.headers.get('location'), 'https://tacos.example/sign-in?next=%2Fadmin&error=maintenance');
        assert.equal(response.cookies.get('session')?.value, '');
        assert.equal(response.cookies.get('session')?.maxAge, 0);
        assert.match(response.headers.get('cache-control'), /no-store/);
        const retry = await proxy(new NextRequest(response.headers.get('location')));
        assert.equal(retry.status, 200);
        assert.equal(retry.headers.get('location'), null);
      }
    }
    const signedOut = state.signedOut;
    state.enabled = true;
    state.user = { id: 'admin-user' };
    state.role = 'admin';
    assert.equal((await proxy(new NextRequest('https://tacos.example/sign-in'))).status, 200);
    assert.equal(state.signedOut, signedOut);
    state.enabled = false;
    state.role = 'customer';
    assert.equal((await proxy(new NextRequest('https://tacos.example/sign-in'))).status, 200);
    assert.equal(state.signedOut, signedOut);
    state.enabled = true;
    state.signOutError = true;
    const failedSignOut = await proxy(new NextRequest('https://tacos.example/sign-in'));
    assert.equal(failedSignOut.status, 503);
    assert.equal(failedSignOut.headers.get('location'), null);
  } finally { delete globalThis.__maintenanceProxy; }
});

test('login returns preserve local paths and checkout query strings', () => {
  for (const path of ['/', '/account', '/account/orders', '/admin', '/checkout?event=123&slot=456']) {
    assert.equal(safeReturnPath(path), path);
  }
});

test('login returns reject external URLs, malformed input and auth loops', () => {
  for (const path of ['/sign-in', '/sign-in/', '/sign-in?next=/admin', '/%73ign-in']) {
    assert.equal(safeReturnPath(path), '/account', path);
  }
  for (const path of [undefined, [], ['/admin', '/account'], {}, 42, '', 'https://example.com', '//example.com', '/\\example.com', '/%2f%2fexample.com', '/%5cexample.com', '/%0aevil', '/%zz', '/auth/callback', '/auth/confirm?token_hash=secret', '/login', '/login?next=/login', '/\nexample', ' /account']) {
    assert.equal(safeReturnPath(path), '/account', String(path));
  }
});

test('sign-in destinations respect roles, safe return links and missing profiles', () => {
  assert.equal(signedInPath(undefined, 'admin'), '/admin');
  assert.equal(signedInPath('/account', 'admin'), '/admin');
  assert.equal(signedInPath(undefined, 'customer'), '/account');
  assert.equal(signedInPath('/admin/orders', 'customer'), '/account');
  assert.equal(signedInPath('/%61dmin/orders', null), '/account');
  assert.equal(signedInPath('/admin', undefined), '/account');
  assert.equal(signedInPath('/admin/orders', 'admin'), '/admin/orders');
  assert.equal(signedInPath('/checkout?event=123', 'admin'), '/checkout?event=123');
  assert.equal(signedInPath('/checkout?event=123', 'customer'), '/checkout?event=123');
  assert.equal(signedInPath('//example.com', 'admin'), '/admin');
});

test('auth callback origin is explicit in production and local ports work in development', () => {
  assert.equal(appOrigin(undefined, 'http://localhost:3001', false), 'http://localhost:3001');
  assert.equal(appOrigin('https://tacos.example', 'https://untrusted.example', true), 'https://tacos.example');
  assert.throws(() => appOrigin(undefined, 'https://untrusted.example', true), /SITE_URL/);
  assert.throws(() => appOrigin(undefined, 'https://untrusted.example', false), /SITE_URL/);
  assert.throws(() => appOrigin('http://tacos.example', 'http://localhost:3000', true), /secure/);
  assert.throws(() => appOrigin('https://tacos.example/path', 'http://localhost:3000', false), /origin/);
  assert.throws(() => appOrigin('https://user:password@tacos.example', 'http://localhost:3000', false), /credentials/);
});

test('callback exchanges PKCE codes and email hashes, but rejects ambiguous or failed requests', async () => {
  const calls = [];
  const auth = {
    exchangeCodeForSession: async (code) => { calls.push(['code', code]); return { error: null }; },
    verifyOtp: async (values) => { calls.push(['otp', values]); return { error: null }; },
  };
  assert.equal(await exchangeCredentials(auth, new URLSearchParams('code=example-code')), true);
  assert.equal(await exchangeCredentials(auth, new URLSearchParams('token_hash=example-hash&type=email')), true);
  assert.deepEqual(calls, [['code', 'example-code'], ['otp', { token_hash: 'example-hash', type: 'email' }]]);
  for (const type of ['signup', 'magiclink']) {
    assert.equal(await exchangeCredentials(auth, new URLSearchParams(`token_hash=example-hash&type=${type}`)), true);
    assert.deepEqual(calls.at(-1), ['otp', { token_hash: 'example-hash', type }]);
  }
  for (const query of ['', 'error=access_denied', 'code=code&token_hash=hash&type=email', 'token_hash=hash&type=recovery', 'token_hash=hash']) {
    assert.equal(await exchangeCredentials(auth, new URLSearchParams(query)), false);
  }
  assert.equal(calls.length, 4);
  assert.equal(await exchangeCredentials({ ...auth, verifyOtp: async () => ({ error: { message: 'expired' } }) }, new URLSearchParams('token_hash=expired&type=email')), false);
  assert.equal(await exchangeCredentials({ ...auth, exchangeCodeForSession: async () => { throw new Error('Offline'); } }, new URLSearchParams('code=example')), false);
});

test('signup and profile inputs enforce the database field limits', () => {
  assert.equal(loginSchema.safeParse({ email: 'not-an-email', mode: 'login', fullName: '' }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'person@example.test', mode: 'signup', fullName: '' }).success, false);
  assert.equal(loginSchema.parse({ email: 'PERSON@example.test', mode: 'signup', fullName: ' Person ', password: 'A-long-password-123' }).email, 'person@example.test');
  assert.equal(loginSchema.safeParse({ email: 'person@example.test', mode: 'signup', fullName: 'Person', password: 'short' }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'person@example.test', mode: 'login', fullName: '' }).success, true);
  assert.equal(profileSchema.safeParse({ fullName: 'Person', phone: '+44 (0) 7700 900123' }).success, true);
  assert.equal(profileSchema.safeParse({ fullName: 'Person', phone: 'invalid' }).success, false);
  assert.equal(profileSchema.safeParse({ fullName: 'x'.repeat(121), phone: '' }).success, false);
});

test('signup creates a password account and resumes checkout only with a real session', async () => {
  const state = { calls: [], error: null, session: { user: { id: 'new-customer' } }, permitted: true };
  globalThis.__signup = state;
  const originalOrigin = process.env.SITE_URL;
  process.env.SITE_URL = 'https://tacos.example';
  try {
    const result = await build({ entryPoints: ['src/app/auth/actions.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'signup-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(server-only|next\/(headers|navigation|cache)|@\/lib\/supabase\/server|@\/lib\/auth\/maintenance-sign-in)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => {
        let contents = '';
        if (args.path === 'next/headers') contents = 'export async function headers() { return new Headers({origin:"https://tacos.example"}); }';
        if (args.path === 'next/navigation') contents = 'export function redirect(path) { throw new Error("REDIRECT:" + path); }';
        if (args.path === 'next/cache') contents = 'export function revalidatePath() {}';
        if (args.path.endsWith('maintenance-sign-in')) contents = 'export async function canRequestMagicLink() { return globalThis.__signup.permitted; }';
        if (args.path.endsWith('/server')) contents = `export async function createServerSupabase() {
          const state = globalThis.__signup;
          const operation = (method) => async (input) => { state.calls.push({method,input}); return {data:{session:state.session},error:state.error}; };
          return {auth:{signUp:operation('signup'),signInWithOtp:operation('otp'),signInWithPassword:operation('password')},
            from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'customer'},error:null})})})})};
        }`;
        return { contents };
      });
    } }] });
    const { requestMagicLink } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    const form = new FormData();
    for (const [key, value] of Object.entries({ mode: 'signup', email: 'CUSTOMER@example.test', fullName: 'Customer', password: 'A-long-password-123', next: '/checkout?event=drive-in' })) form.set(key, value);
    await assert.rejects(() => requestMagicLink({}, form), /REDIRECT:\/checkout\?event=drive-in/);
    assert.equal(state.calls[0].method, 'signup');
    assert.equal(state.calls[0].input.email, 'customer@example.test');
    assert.equal(state.calls[0].input.password, 'A-long-password-123');
    assert.deepEqual(state.calls[0].input.options.data, { full_name: 'Customer' });
    assert.equal(state.calls[0].input.options.emailRedirectTo, 'https://tacos.example/auth/confirm?next=%2Fcheckout%3Fevent%3Ddrive-in');
    state.session = null;
    assert.equal((await requestMagicLink({}, form)).status, 'error');
    state.error = { code: 'user_already_exists', status: 422 };
    assert.match((await requestMagicLink({}, form)).message, /already have an account/);
    state.error = null;
    form.set('mode', 'login');
    assert.equal((await requestMagicLink({}, form)).status, 'success');
    assert.equal(state.calls.at(-1).method, 'otp');
    assert.equal(state.calls.at(-1).input.options.shouldCreateUser, false);
    form.set('loginMethod', 'password');
    assert.equal((await requestMagicLink({}, form)).status, 'error');
    state.session = { user: { id: 'existing-customer' } };
    await assert.rejects(() => requestMagicLink({}, form), /REDIRECT:\/checkout\?event=drive-in/);
    assert.equal(state.calls.at(-1).method, 'password');
    state.permitted = false;
    const callCount = state.calls.length;
    assert.match((await requestMagicLink({}, form)).message, /restricted/);
    assert.equal(state.calls.length, callCount);
  } finally {
    if (originalOrigin === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = originalOrigin;
    delete globalThis.__signup;
  }
});

test('email confirmation GET does not consume links and POST requires the same origin', async () => {
  const state = { calls: 0 };
  globalThis.__confirmation = state;
  try {
    const result = await build({ entryPoints: ['src/app/auth/confirm/route.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'confirm-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(next\/server|@\/lib\/auth\/callback)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: args.path === 'next/server'
        ? `export { NextResponse } from ${JSON.stringify(new URL('../node_modules/next/server.js', import.meta.url).href)};`
        : 'export async function completeSignIn() { globalThis.__confirmation.calls++; return new Response(null,{status:303}); }' }));
      builder.onResolve({ filter: /^file:/ }, (args) => ({ path: args.path, external: true }));
    } }] });
    const { GET, POST } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    for (const query of ['token_hash=private-token&type=email', 'token_hash=private-token&type=signup', 'token_hash=private-token&type=magiclink', 'code=private-code']) {
      const url = `https://tacos.example/auth/confirm?${query}&next=%2Fcheckout`;
      const response = await GET(new NextRequest(url));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('referrer-policy'), 'same-origin');
      assert.match(response.headers.get('cache-control'), /no-store/);
      const html = await response.text();
      assert.match(html, /<form method="post">/);
      assert.doesNotMatch(html, /private-token|private-code/);
      assert.equal(state.calls, 0);
    }
    const url = 'https://tacos.example/auth/confirm?token_hash=private-token&type=email';
    for (const origin of [undefined, 'https://untrusted.example']) {
      const response = await POST(new NextRequest(url, { method: 'POST', headers: origin ? { origin } : {} }));
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), 'https://tacos.example/sign-in?error=invalid_link&next=%2Faccount');
    }
    assert.equal(state.calls, 0);
    assert.equal((await POST(new NextRequest(url, { method: 'POST', headers: { origin: 'https://tacos.example' } }))).status, 303);
    assert.equal(state.calls, 1);
  } finally { delete globalThis.__confirmation; }
});