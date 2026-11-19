import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  decodeToken,
  hasRole,
  canAccessExpertDesk
} from './auth';
import { User } from '../types';

test('Salted scrypt hashing yields unique hashes per call and verifies cleanly', () => {
  const hash1 = hashPassword('Citizen@123');
  const hash2 = hashPassword('Citizen@123');
  assert.notStrictEqual(hash1, hash2, 'Per-user random salt must prevent identical hashes');
  assert.ok(hash1.includes(':'), 'Hash must include salt separator');
  assert.strictEqual(verifyPassword('Citizen@123', hash1), true);
  assert.strictEqual(verifyPassword('Citizen@123', hash2), true);
  assert.strictEqual(verifyPassword('WrongPassword', hash1), false);
});

test('generateToken produces HMAC-signed token rejected if tampered or expired', () => {
  const mockUser: User = {
    id: 'USR_CIT_999',
    fullName: 'Test Citizen',
    email: 'test@pune.in',
    role: 'CITIZEN',
    accountStatus: 'ACTIVE',
    createdAt: new Date().toISOString()
  };

  const token = generateToken(mockUser);
  const decoded = decodeToken(token);
  assert.ok(decoded !== null);
  assert.strictEqual(decoded.userId, 'USR_CIT_999');
  assert.strictEqual(decoded.role, 'CITIZEN');
  assert.strictEqual(decoded.status, 'ACTIVE');
  assert.ok(decoded.exp > Date.now());

  // Tamper payload
  const [payload, sig] = token.split('.');
  const fakePayload = Buffer.from(
    JSON.stringify({ ...decoded, role: 'EXPERT' }),
    'utf-8'
  ).toString('base64url');
  assert.strictEqual(decodeToken(`${fakePayload}.${sig}`), null, 'Tampered token must fail HMAC verification');

  // Expired token
  const expired = generateToken(mockUser, -5000);
  assert.strictEqual(decodeToken(expired), null);
  assert.strictEqual(decodeToken('malformed'), null);
});

test('hasRole and canAccessExpertDesk enforce strictly two roles (CITIZEN and EXPERT)', () => {
  assert.strictEqual(hasRole('EXPERT', ['EXPERT']), true);
  assert.strictEqual(hasRole('CITIZEN', ['EXPERT']), false);
  assert.strictEqual(hasRole('CITIZEN', ['CITIZEN']), true);

  assert.strictEqual(canAccessExpertDesk({ role: 'EXPERT', accountStatus: 'ACTIVE' }), true);
  assert.strictEqual(canAccessExpertDesk({ role: 'EXPERT', accountStatus: 'PENDING_APPROVAL' }), false);
  assert.strictEqual(canAccessExpertDesk({ role: 'EXPERT', accountStatus: 'REJECTED' }), false);
  assert.strictEqual(canAccessExpertDesk({ role: 'EXPERT', accountStatus: 'SUSPENDED' }), false);
  assert.strictEqual(canAccessExpertDesk({ role: 'CITIZEN', accountStatus: 'ACTIVE' }), false);
});
