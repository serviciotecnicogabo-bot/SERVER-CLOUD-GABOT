import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequireAuth, allowRoles } from './auth.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('rejects requests without a bearer token', async () => {
  const res = response();
  let lookedUp = false;
  const middleware = createRequireAuth({
    verifyToken: () => ({ sub: 'u1', tenantId: 't1' }),
    findActiveUser: async () => { lookedUp = true; return null; },
  });
  await middleware({ headers: {} }, res, () => assert.fail('next must not run'));
  assert.equal(res.statusCode, 401);
  assert.equal(lookedUp, false);
});

test('rejects invalid or expired tokens', async () => {
  const res = response();
  const middleware = createRequireAuth({
    verifyToken: () => { throw new Error('invalid token'); },
    findActiveUser: async () => assert.fail('database lookup must not run'),
  });
  await middleware({ headers: { authorization: 'Bearer invalid' } }, res, () => assert.fail('next must not run'));
  assert.equal(res.statusCode, 401);
});

test('rejects users who are inactive or no longer belong to the token tenant', async () => {
  const res = response();
  const middleware = createRequireAuth({
    verifyToken: () => ({ sub: 'u1', tenantId: 't1', role: 'OWNER' }),
    findActiveUser: async (id, tenantId) => {
      assert.equal(id, 'u1');
      assert.equal(tenantId, 't1');
      return null;
    },
  });
  await middleware({ headers: { authorization: 'Bearer valid' } }, res, () => assert.fail('next must not run'));
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /desactivado/);
});

test('loads current role from database instead of trusting stale JWT role', async () => {
  const req = { headers: { authorization: 'Bearer valid' } };
  const res = response();
  let continued = false;
  const middleware = createRequireAuth({
    verifyToken: () => ({ sub: 'u1', tenantId: 't1', role: 'OWNER' }),
    findActiveUser: async () => ({ id: 'u1', tenantId: 't1', role: 'SUPPORT' }),
  });
  await middleware(req, res, () => { continued = true; });
  assert.equal(continued, true);
  assert.deepEqual(req.user, { id: 'u1', tenantId: 't1', role: 'SUPPORT' });
});

test('passes database failures to Express error handling', async () => {
  const res = response();
  const failure = new Error('database unavailable');
  let forwarded;
  const middleware = createRequireAuth({
    verifyToken: () => ({ sub: 'u1', tenantId: 't1' }),
    findActiveUser: async () => { throw failure; },
  });
  await middleware({ headers: { authorization: 'Bearer valid' } }, res, error => { forwarded = error; });
  assert.equal(forwarded, failure);
});

test('allows only explicitly listed current roles', () => {
  const middleware = allowRoles('OWNER', 'ADMIN');
  let continued = false;
  middleware({ user: { role: 'ADMIN' } }, response(), () => { continued = true; });
  assert.equal(continued, true);

  const res = response();
  middleware({ user: { role: 'SUPPORT' } }, res, () => assert.fail('next must not run'));
  assert.equal(res.statusCode, 403);
});
