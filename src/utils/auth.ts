import crypto from 'crypto';
import { User, UserRole, AccountStatus } from '../types';

const SALT = 'floodguard_pune_salt_2026';

export function hashPassword(password: string): string {
  return crypto.pbkdf2Sync(password, SALT, 1000, 64, 'sha512').toString('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
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
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    const raw = Buffer.from(token, 'base64').toString('utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.exp && parsed.exp < Date.now()) return null;
    if (!parsed.userId || !parsed.role || !parsed.status) return null;
    return parsed as TokenPayload;
  } catch {
    return null;
  }
}

export function hasRole(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}

export function canAccessExpertDesk(user: { role: UserRole; accountStatus: AccountStatus }): boolean {
  return (user.role === 'EXPERT' || user.role === 'ADMIN') && user.accountStatus === 'ACTIVE';
}
