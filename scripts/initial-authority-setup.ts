import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { hashPassword } from '../src/utils/auth';

dotenv.config();

async function main(): Promise<void> {
  const required = [
    'AUTHORITY_NAME',
    'AUTHORITY_TYPE',
    'AUTHORITY_REGION',
    'ADMIN_FULL_NAME',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD'
  ] as const;
  const missing = required.filter(name => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing required setup environment variables: ${missing.join(', ')}`);
  }

  const authorityName = process.env.AUTHORITY_NAME!.trim();
  const authorityType = process.env.AUTHORITY_TYPE!.trim();
  const authorityRegion = process.env.AUTHORITY_REGION!.trim();
  const adminName = process.env.ADMIN_FULL_NAME!.trim();
  const adminEmail = process.env.ADMIN_EMAIL!.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD!;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error('ADMIN_EMAIL must be a valid email address.');
  }
  if (adminName.length < 2 || authorityName.length < 2 || authorityType.length < 2 || authorityRegion.length < 2) {
    throw new Error('Authority name, type, region, and admin name must each contain at least two characters.');
  }
  if (adminPassword.length < 12 || adminPassword.length > 256) {
    throw new Error('ADMIN_PASSWORD must contain at least 12 characters and no more than 256.');
  }

  process.env.SEED_DEMO_ACCOUNTS = 'false';
  const { SanketSetuDatabase } = await import('../src/db/database');
  const database = new SanketSetuDatabase();
  const now = new Date().toISOString();
  const authorityId = `AUTH_${crypto.randomUUID()}`;
  const userId = `USR_${crypto.randomUUID()}`;
  const membershipId = `MEM_${crypto.randomUUID()}`;

  try {
    database.db.exec('BEGIN IMMEDIATE;');
    const authorityCount = database.db.prepare('SELECT COUNT(*) AS count FROM authorities').get() as { count: number };
    const adminCount = database.db.prepare(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'AUTHORITY_ADMIN'"
    ).get() as { count: number };
    if (Number(authorityCount.count) > 0 || Number(adminCount.count) > 0) {
      database.db.exec('ROLLBACK;');
      throw new Error('Initial authority setup has already been completed. No changes were made.');
    }
    if (database.getUserByEmail(adminEmail)) {
      database.db.exec('ROLLBACK;');
      throw new Error('ADMIN_EMAIL already belongs to an account. Choose a different email.');
    }

    database.db.prepare(`
      INSERT INTO authorities (id, name, authority_type, region, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
    `).run(authorityId, authorityName, authorityType, authorityRegion, now, now);
    database.createUser({
      id: userId,
      fullName: adminName,
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: 'AUTHORITY_ADMIN',
      accountStatus: 'ACTIVE',
      createdAt: now
    });
    database.db.prepare(`
      INSERT INTO authority_memberships
        (id, authority_id, user_id, membership_role, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'AUTHORITY_ADMIN', 'ACTIVE', ?, ?, ?)
    `).run(membershipId, authorityId, userId, userId, now, now);

    const legacyExperts = database.db.prepare(`
      SELECT id FROM users
      WHERE role = 'EXPERT' AND account_status = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM authority_memberships m WHERE m.user_id = users.id)
    `).all() as { id: string }[];
    const addLegacyExpert = database.db.prepare(`
      INSERT INTO authority_memberships
        (id, authority_id, user_id, membership_role, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'EXPERT', 'ACTIVE', ?, ?, ?)
    `);
    for (const expert of legacyExperts) {
      addLegacyExpert.run(`MEM_${crypto.randomUUID()}`, authorityId, expert.id, userId, now, now);
      database.db.prepare(`
        UPDATE audit_logs SET authority_id = ? WHERE actor_id = ? AND authority_id IS NULL
      `).run(authorityId, expert.id);
    }
    database.db.prepare(
      'UPDATE road_segments SET authority_id = ? WHERE authority_id IS NULL'
    ).run(authorityId);
    database.db.prepare(
      'UPDATE shelters SET authority_id = ? WHERE authority_id IS NULL'
    ).run(authorityId);
    database.db.prepare(`
      UPDATE road_updates
      SET authority_id = (
        SELECT authority_id FROM road_segments WHERE road_segments.road_id = road_updates.road_id
      )
      WHERE authority_id IS NULL
    `).run();
    database.db.prepare(`
      UPDATE expert_applications SET authority_id = ?
      WHERE authority_id IS NULL AND status = 'PENDING_APPROVAL'
    `).run(authorityId);
    const admin = database.getUserById(userId);
    if (!admin) throw new Error('Failed to retrieve the newly created Authority Admin.');
    database.appendAuthorityAuditLog(admin, authorityId, 'INITIAL_AUTHORITY_CREATED',
      authorityId, `Initialized ${authorityName} and created its first Authority Admin.`);
    database.db.exec('COMMIT;');
    console.log(`Initial Authority Admin created for ${authorityName} (${authorityRegion}).`);
    console.log(`Linked ${legacyExperts.length} existing active Expert account(s); assign permissions from the dashboard.`);
  } catch (error) {
    try {
      database.db.exec('ROLLBACK;');
    } catch {
      // The transaction may already have been rolled back after a validation failure.
    }
    throw error;
  } finally {
    database.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Initial authority setup failed.');
  process.exitCode = 1;
});
