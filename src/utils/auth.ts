import crypto from 'node:crypto';
import { User, UserRole, AccountStatus } from '../types';

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  // Ephemeral fallback per process in development; production should always configure SESSION_SECRET
  if (!(globalThis as any).__sanketsetuSessionSecret) {
    (globalThis as any).__sanketsetuSessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return (globalThis as any).__sanketsetuSessionSecret;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export interface TokenPayload {
  userId: string;
  role: UserRole;
  status: AccountStatus;
  email: string;
  exp: number;
}

export function generateToken(user: User, expiresInMs: number = 24 * 60 * 60 * 1000): string {
  const payload: TokenPayload = {
    userId: user.id,
    role: user.role,
    status: user.accountStatus,
    email: user.email,
    exp: Date.now() + expiresInMs
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${signature}`;
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    if (!token || !token.includes('.')) return null;
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return null;

    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(payloadB64)
      .digest('base64url');

    const sigBuf = Buffer.from(sigB64, 'utf-8');
    const expectedBuf = Buffer.from(expectedSig, 'utf-8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const raw = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw) as TokenPayload;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (!parsed.userId || !parsed.status) return null;
    if (parsed.role !== 'CITIZEN' && parsed.role !== 'EXPERT') return null;

    return parsed;
  } catch {
    return null;
  }
}

export function hasRole(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}

export function canAccessExpertDesk(user: { role: UserRole; accountStatus: AccountStatus }): boolean {
  return user.role === 'EXPERT' && user.accountStatus === 'ACTIVE';
}
