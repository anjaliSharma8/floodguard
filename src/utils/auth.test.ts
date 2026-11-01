import test from 'node:test';
import assert from 'node:assert';
import { 
  hashPassword, 
  verifyPassword, 
  generateToken, 
  decodeToken, 
  hasRole, 
  canAccessExpertDesk 
} from './auth';
import { User } from '../types';

test('Password hashing produces consistent SHA512 hash and verifies correctly', () => {
  const hash1 = hashPassword('Citizen@123');
  const hash2 = hashPassword('Citizen@123');
  assert.strictEqual(hash1, hash2, 'Identical passwords should yield identical deterministic hashes');
  assert.strictEqual(verifyPassword('Citizen@123', hash1), true);
  assert.strictEqual(verifyPassword('WrongPassword', hash1), false);
});

test('generateToken produces valid base64 payload with expiration', () => {
  const mockUser: User = {
    id: 'USR_CIT_999',
    fullName: 'Test User',
    email: 'test@pune.in',
    role: 'CITIZEN',
    accountStatus: 'ACTIVE',
    createdAt: new Date().toISOString()
  };

  const token = generateToken(mockUser);
  assert.ok(typeof token === 'string' && token.length > 20);

  const decoded = decodeToken(token);
  assert.ok(decoded !== null);
  assert.strictEqual(decoded.userId, 'USR_CIT_999');
  assert.strictEqual(decoded.role, 'CITIZEN');
  assert.strictEqual(decoded.status, 'ACTIVE');
  assert.strictEqual(decoded.email, 'test@pune.in');
  assert.ok(decoded.exp > Date.now());
});

test('decodeToken safely rejects expired or malformed tokens', () => {
  const mockUser: User = {
    id: 'USR_EXP_999',
    fullName: 'Expired User',
    email: 'expired@pune.in',
    role: 'EXPERT',
    accountStatus: 'ACTIVE',
    createdAt: new Date().toISOString()
  };

  // Generate already expired token (-1000ms)
  const expiredToken = generateToken(mockUser, -1000);
  assert.strictEqual(decodeToken(expiredToken), null, 'Expired tokens must return null');

  assert.strictEqual(decodeToken('not-a-valid-token'), null, 'Malformed tokens must return null');
  assert.strictEqual(decodeToken(''), null, 'Empty string token must return null');
});

test('hasRole correctly validates role hierarchies and permissions', () => {
  assert.strictEqual(hasRole('ADMIN', ['EXPERT', 'ADMIN']), true);
  assert.strictEqual(hasRole('EXPERT', ['EXPERT', 'ADMIN']), true);
  assert.strictEqual(hasRole('CITIZEN', ['EXPERT', 'ADMIN']), false);
  assert.strictEqual(hasRole('CITIZEN', ['CITIZEN']), true);
});

test('canAccessExpertDesk strictly rejects pending, suspended, or citizen users', () => {
  // Active expert should be granted access
  assert.strictEqual(canAccessExpertDesk({ role: 'EXPERT', accountStatus: 'ACTIVE' }), true);
  // Active admin should be granted access
  assert.strictEqual(canAccessExpertDesk({ role: 'ADMIN', accountStatus: 'ACTIVE' }), true);

  // Pending approval expert must be BLOCKED
  assert.strictEqual(canAccessExpertDesk({ role: 'EXPERT', accountStatus: 'PENDING_APPROVAL' }), false);
  // Rejected expert must be BLOCKED
  assert.strictEqual(canAccessExpertDesk({ role: 'EXPERT', accountStatus: 'REJECTED' }), false);
  // Suspended expert must be BLOCKED
  assert.strictEqual(canAccessExpertDesk({ role: 'EXPERT', accountStatus: 'SUSPENDED' }), false);

  // Citizen even if active must be BLOCKED from expert desk
  assert.strictEqual(canAccessExpertDesk({ role: 'CITIZEN', accountStatus: 'ACTIVE' }), false);
});
