import assert from 'node:assert/strict';
import test from 'node:test';
import { appOrigin, safeReturnPath, signedInPath } from '../src/lib/auth/redirects.ts';
import { exchangeCredentials } from '../src/lib/auth/exchange.ts';
import { loginSchema, profileSchema } from '../src/lib/auth/validation.ts';

test('login returns preserve local paths and checkout query strings', () => {
  for (const path of ['/', '/account', '/account/orders', '/admin', '/checkout?event=123&slot=456']) {
    assert.equal(safeReturnPath(path), path);
  }
});

test('login returns reject external URLs, malformed input and auth loops', () => {
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
  for (const query of ['', 'error=access_denied', 'code=code&token_hash=hash&type=email', 'token_hash=hash&type=recovery', 'token_hash=hash']) {
    assert.equal(await exchangeCredentials(auth, new URLSearchParams(query)), false);
  }
  assert.equal(calls.length, 2);
  assert.equal(await exchangeCredentials({ ...auth, verifyOtp: async () => ({ error: { message: 'expired' } }) }, new URLSearchParams('token_hash=expired&type=email')), false);
  assert.equal(await exchangeCredentials({ ...auth, exchangeCodeForSession: async () => { throw new Error('Offline'); } }, new URLSearchParams('code=example')), false);
});

test('signup and profile inputs enforce the database field limits', () => {
  assert.equal(loginSchema.safeParse({ email: 'not-an-email', mode: 'login', fullName: '' }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'person@example.test', mode: 'signup', fullName: '' }).success, false);
  assert.equal(loginSchema.parse({ email: 'PERSON@example.test', mode: 'signup', fullName: ' Person ' }).email, 'person@example.test');
  assert.equal(profileSchema.safeParse({ fullName: 'Person', phone: '+44 (0) 7700 900123' }).success, true);
  assert.equal(profileSchema.safeParse({ fullName: 'Person', phone: 'invalid' }).success, false);
  assert.equal(profileSchema.safeParse({ fullName: 'x'.repeat(121), phone: '' }).success, false);
});