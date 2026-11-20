process.env.SANKETSETU_NO_LISTEN = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createSanketSetuApp } from '../../server';
import { SanketSetuDatabase } from '../db/database';
import { generateToken, hashPassword } from '../utils/auth';
import { User } from '../types';
import type { AddressInfo } from 'node:net';

function makeTmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(join(os.tmpdir(), `sanketsetu-${name}-`));
  return join(dir, 'test.db');
}

async function withServer(
  dbPath: string,
  callback: (baseUrl: string, db: SanketSetuDatabase) => Promise<void>
): Promise<void> {
  const { app, db } = createSanketSetuApp(dbPath);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await callback(`http://127.0.0.1:${port}`, db);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
}

function createAuthority(db: SanketSetuDatabase, id: string, adminId: string, email: string): void {
  const now = new Date().toISOString();
  db.db.prepare(`
    INSERT INTO authorities (id, name, authority_type, region, status, created_at, updated_at)
    VALUES (?, ?, 'GOVERNMENT', ?, 'ACTIVE', ?, ?)
  `).run(id, `Authority ${id}`, `Region ${id}`, now, now);
  db.createUser({
    id: adminId,
    fullName: `Admin ${id}`,
    email,
    passwordHash: hashPassword('AdminPassword@123'),
    role: 'AUTHORITY_ADMIN',
    accountStatus: 'ACTIVE',
    createdAt: now
  });
  db.db.prepare(`
    INSERT INTO authority_memberships
      (id, authority_id, user_id, membership_role, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 'AUTHORITY_ADMIN', 'ACTIVE', ?, ?, ?)
  `).run(`MEM_${adminId}`, id, adminId, adminId, now, now);
  db.db.prepare('UPDATE road_segments SET authority_id = ? WHERE authority_id IS NULL').run(id);
  db.db.prepare('UPDATE shelters SET authority_id = ? WHERE authority_id IS NULL').run(id);
}

async function loginAdmin(baseUrl: string, email: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/authority-admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'AdminPassword@123' })
  });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

function bearer(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

test('migration v2 preserves existing accounts, applications, audit rows, and makes a pre-migration backup', () => {
  const dbPath = makeTmpDbPath('migration');
  const raw = new DatabaseSync(dbPath);
  raw.exec(fs.readFileSync(join(process.cwd(), 'database', 'schema.sql'), 'utf8'));
  raw.prepare(`
    INSERT INTO users
      (id, full_name, email, password_hash, role, account_status, created_at, updated_at)
    VALUES ('legacy-expert', 'Legacy Expert', 'legacy@agency.gov', 'salt:hash', 'EXPERT', 'ACTIVE', '2025-01-01', '2025-01-01')
  `).run();
  raw.prepare(`
    INSERT INTO expert_applications
      (application_id, user_id, full_name, email, organisation, designation, status, applied_at)
    VALUES ('legacy-app', 'legacy-expert', 'Legacy Expert', 'legacy@agency.gov', 'Agency', 'Officer', 'PENDING_APPROVAL', '2025-01-02')
  `).run();
  raw.prepare(`
    INSERT INTO audit_logs
      (log_id, actor_id, actor_name, actor_role, action, target_resource, details, timestamp)
    VALUES ('legacy-log', 'legacy-expert', 'Legacy Expert', 'EXPERT', 'OLD_ACTION', 'target', 'kept', '2025-01-03')
  `).run();
  raw.prepare(`
    INSERT INTO road_segments
      (road_id, road_name, from_node, to_node, road_type, distance_km, speed_kmph,
       risk_category, confidence_score, status, coordinates_json, updated_at)
    VALUES ('legacy-road', 'Legacy Road', 'A', 'B', 'primary', 1, 30,
            'Low', 0.8, 'OPEN', '[]', '2025-01-03')
  `).run();
  raw.prepare(`
    INSERT INTO shelters
      (shelter_id, name, latitude, longitude, capacity, current_occupancy, contact, address, last_updated)
    VALUES ('legacy-shelter', 'Legacy Shelter', 18.5, 73.8, 100, 2, '100', 'Pune', '2025-01-03')
  `).run();
  raw.close();

  const migrated = new SanketSetuDatabase(dbPath);
  try {
    assert.equal((migrated.db.prepare("SELECT COUNT(*) AS count FROM users WHERE id = 'legacy-expert'").get() as { count: number }).count, 1);
    assert.equal((migrated.db.prepare("SELECT COUNT(*) AS count FROM expert_applications WHERE application_id = 'legacy-app'").get() as { count: number }).count, 1);
    assert.equal((migrated.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE log_id = 'legacy-log'").get() as { count: number }).count, 1);
    assert.equal((migrated.db.prepare("SELECT COUNT(*) AS count FROM road_segments WHERE road_id = 'legacy-road'").get() as { count: number }).count, 1);
    assert.equal((migrated.db.prepare("SELECT COUNT(*) AS count FROM shelters WHERE shelter_id = 'legacy-shelter'").get() as { count: number }).count, 1);
    assert.deepEqual(
      (migrated.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[]).map(row => row.version),
      [1, 2, 3, 4, 5, 6, 7]
    );
    assert.deepEqual(migrated.db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.ok(fs.readdirSync(join(dbPath, '..')).some(name => name.startsWith('test.db.pre-authority-v3-') && name.endsWith('.bak')));
    assert.doesNotThrow(() => migrated.db.prepare(`
      INSERT INTO users
        (id, full_name, email, password_hash, role, account_status, created_at, updated_at)
      VALUES ('new-admin', 'Admin', 'new-admin@agency.gov', 'salt:hash', 'AUTHORITY_ADMIN', 'ACTIVE', '2026', '2026')
    `).run());
  } finally {
    migrated.close();
  }
});

test('authority scoping, invitations, permissions, suspension, and last-admin protection are enforced', async () => {
  await withServer(makeTmpDbPath('authority'), async (baseUrl, db) => {
    createAuthority(db, 'AUTH_A', 'ADMIN_A', 'admin.a@gov.in');
    createAuthority(db, 'AUTH_B', 'ADMIN_B', 'admin.b@gov.in');
    const foreignShelter = db.db.prepare('SELECT shelter_id FROM shelters ORDER BY shelter_id LIMIT 1').get() as { shelter_id: string };
    db.db.prepare("UPDATE road_segments SET authority_id = 'AUTH_B' WHERE road_id = 'R02'").run();
    db.db.prepare("UPDATE shelters SET authority_id = 'AUTH_B' WHERE shelter_id = ?").run(foreignShelter.shelter_id);
    const tokenA = await loginAdmin(baseUrl, 'admin.a@gov.in');
    const tokenB = await loginAdmin(baseUrl, 'admin.b@gov.in');

    const profile = await fetch(`${baseUrl}/api/authority/profile?authorityId=AUTH_B`, { headers: bearer(tokenA) });
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).authority.id, 'AUTH_A', 'Request authority IDs must not change the derived scope.');
    const scopedMembers = await fetch(`${baseUrl}/api/authority/members?authorityId=AUTH_B`, { headers: bearer(tokenA) });
    assert.equal(scopedMembers.status, 200);
    assert.ok((await scopedMembers.json()).every((member: { authorityId: string }) => member.authorityId === 'AUTH_A'));

    const invited = await fetch(`${baseUrl}/api/authority/invitations`, {
      method: 'POST',
      headers: { ...bearer(tokenA), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'expert.a@gov.in', intendedRole: 'EXPERT' })
    });
    assert.equal(invited.status, 201);
    const inviteData = await invited.json();
    const invitationToken = inviteData.invitationToken as string;
    const invitationRow = db.db.prepare('SELECT token_hash FROM authority_invitations WHERE id = ?').get(inviteData.invitation.id) as { token_hash: string };
    assert.notEqual(invitationRow.token_hash, invitationToken);
    assert.equal(invitationRow.token_hash, crypto.createHash('sha256').update(invitationToken).digest('hex'));

    const crossAuthorityRevoke = await fetch(`${baseUrl}/api/authority/invitations/${inviteData.invitation.id}`, {
      method: 'DELETE',
      headers: bearer(tokenB)
    });
    assert.equal(crossAuthorityRevoke.status, 404);

    const accepted = await fetch(`${baseUrl}/api/authority/invitations/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: invitationToken, fullName: 'Expert A', password: 'ExpertPassword@123' })
    });
    assert.equal(accepted.status, 201);
    const acceptedBody = await accepted.json();
    assert.equal(acceptedBody.user.authorityMembership.authorityId, 'AUTH_A');
    const reused = await fetch(`${baseUrl}/api/authority/invitations/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: invitationToken, fullName: 'Expert A', password: 'ExpertPassword@123' })
    });
    assert.equal(reused.status, 410, 'Accepted invitations are single-use.');

    const membership = db.db.prepare(
      "SELECT id FROM authority_memberships WHERE authority_id = 'AUTH_A' AND user_id = ?"
    ).get(acceptedBody.user.id) as { id: string };
    const selfAssign = await fetch(`${baseUrl}/api/authority/members/${membership.id}/permissions`, {
      method: 'POST',
      headers: { ...bearer(acceptedBody.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission: 'ROAD_STATUS_UPDATE' })
    });
    assert.equal(selfAssign.status, 403, 'Experts cannot grant their own permissions.');

    const permissionGrant = await fetch(`${baseUrl}/api/authority/members/${membership.id}/permissions`, {
      method: 'POST',
      headers: { ...bearer(tokenA), 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission: 'ROAD_STATUS_UPDATE' })
    });
    assert.equal(permissionGrant.status, 200);
    for (const permission of ['SHELTER_MANAGE', 'REPORTS_VERIFY']) {
      const grant = await fetch(`${baseUrl}/api/authority/members/${membership.id}/permissions`, {
        method: 'POST',
        headers: { ...bearer(tokenA), 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission })
      });
      assert.equal(grant.status, 200);
    }
    const oldExpertToken = acceptedBody.token as string;
    const roadUpdate = await fetch(`${baseUrl}/api/roads/R01/status`, {
      method: 'PATCH',
      headers: { ...bearer(oldExpertToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CLOSED', reason: 'Authority field inspection' })
    });
    assert.equal(roadUpdate.status, 200);
    const foreignRoadUpdate = await fetch(`${baseUrl}/api/roads/R02/status`, {
      method: 'PATCH',
      headers: { ...bearer(oldExpertToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CLOSED', reason: 'Must not cross authority boundary' })
    });
    assert.equal(foreignRoadUpdate.status, 404);
    const foreignShelterUpdate = await fetch(`${baseUrl}/api/shelters/${foreignShelter.shelter_id}`, {
      method: 'PATCH',
      headers: { ...bearer(oldExpertToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentOccupancy: 99 })
    });
    assert.equal(foreignShelterUpdate.status, 404);

    const citizenRegistration = await fetch(`${baseUrl}/api/auth/citizen/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Report Citizen', email: 'report.citizen@example.org', password: 'CitizenPassword@123' })
    });
    assert.equal(citizenRegistration.status, 201);
    const citizenToken = (await citizenRegistration.json()).token as string;
    const foreignReportResponse = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { ...bearer(citizenToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roadId: 'R02',
        locationName: 'Authority B Road',
        lat: 18.52,
        lng: 73.85,
        reportType: 'Road blocked',
        severity: 'High',
        description: 'Reported road obstruction'
      })
    });
    assert.equal(foreignReportResponse.status, 201);
    const foreignReport = (await foreignReportResponse.json()).report;
    const foreignReportReview = await fetch(`${baseUrl}/api/reports/${foreignReport.id}/verify`, {
      method: 'PATCH',
      headers: { ...bearer(oldExpertToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ verificationStatus: 'Verified' })
    });
    assert.equal(foreignReportReview.status, 404);
    const auditResponse = await fetch(`${baseUrl}/api/authority/audit-logs`, { headers: bearer(tokenA) });
    assert.equal(auditResponse.status, 200);
    const authorityAudit = (await auditResponse.json()).auditLogs as { authorityId: string; actorId: string; action: string }[];
    assert.ok(authorityAudit.some(log => log.authorityId === 'AUTH_A' && log.actorId === acceptedBody.user.id && log.action === 'ROAD_STATUS_CHANGE'));

    const suspended = await fetch(`${baseUrl}/api/authority/members/${membership.id}/status`, {
      method: 'PATCH',
      headers: { ...bearer(tokenA), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SUSPENDED' })
    });
    assert.equal(suspended.status, 200);
    const oldTokenAfterSuspension = await fetch(`${baseUrl}/api/roads/R01/status`, {
      method: 'PATCH',
      headers: { ...bearer(oldExpertToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'OPEN', reason: 'Old token must not pass' })
    });
    assert.equal(oldTokenAfterSuspension.status, 403, 'A valid old token cannot bypass membership suspension.');
    const reactivated = await fetch(`${baseUrl}/api/authority/members/${membership.id}/status`, {
      method: 'PATCH',
      headers: { ...bearer(tokenA), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACTIVE' })
    });
    assert.equal(reactivated.status, 200);
    const oldTokenAfterReactivation = await fetch(`${baseUrl}/api/roads/R01/status`, {
      method: 'PATCH',
      headers: { ...bearer(oldExpertToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'OPEN', reason: 'Authority reactivated membership' })
    });
    assert.equal(oldTokenAfterReactivation.status, 200);

    const expireInvite = await fetch(`${baseUrl}/api/authority/invitations`, {
      method: 'POST',
      headers: { ...bearer(tokenA), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'expired@gov.in', intendedRole: 'EXPERT' })
    });
    assert.equal(expireInvite.status, 201);
    const expiredData = await expireInvite.json();
    db.db.prepare("UPDATE authority_invitations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?")
      .run(expiredData.invitation.id);
    const expiredAccept = await fetch(`${baseUrl}/api/authority/invitations/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: expiredData.invitationToken, fullName: 'Expired User', password: 'ExpiredPassword@123' })
    });
    assert.equal(expiredAccept.status, 410);

    const suspendedAdmin = await fetch(`${baseUrl}/api/authority/members/MEM_ADMIN_A/status`, {
      method: 'PATCH',
      headers: { ...bearer(tokenA), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SUSPENDED' })
    });
    assert.equal(suspendedAdmin.status, 409, 'The last active Authority Admin cannot be suspended.');

    const secondAdminInvite = await fetch(`${baseUrl}/api/authority/invitations`, {
      method: 'POST',
      headers: { ...bearer(tokenA), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin.a2@gov.in', intendedRole: 'AUTHORITY_ADMIN' })
    });
    assert.equal(secondAdminInvite.status, 201);
    const secondAdminInvitation = await secondAdminInvite.json();
    const secondAdminAccept = await fetch(`${baseUrl}/api/authority/invitations/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: secondAdminInvitation.invitationToken, fullName: 'Second Admin', password: 'SecondAdmin@12345' })
    });
    assert.equal(secondAdminAccept.status, 201);
    const nowReplaceable = await fetch(`${baseUrl}/api/authority/members/MEM_ADMIN_A/status`, {
      method: 'PATCH',
      headers: { ...bearer(tokenA), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SUSPENDED' })
    });
    assert.equal(nowReplaceable.status, 200);
    const oldAdminToken = await fetch(`${baseUrl}/api/authority/dashboard`, { headers: bearer(tokenA) });
    assert.equal(oldAdminToken.status, 403);
    db.db.prepare("UPDATE authorities SET status = 'SUSPENDED' WHERE id = 'AUTH_A'").run();
    const suspendedAuthority = await fetch(`${baseUrl}/api/authority/dashboard`, {
      headers: bearer((await secondAdminAccept.json()).token)
    });
    assert.equal(suspendedAuthority.status, 403, 'An active membership in a suspended authority grants no access.');
  });
});

test('pending Experts are blocked and only the reviewing authority Admin can approve applications', async () => {
  await withServer(makeTmpDbPath('approval'), async (baseUrl, db) => {
    createAuthority(db, 'AUTH_A', 'ADMIN_A', 'admin.a@gov.in');
    createAuthority(db, 'AUTH_B', 'ADMIN_B', 'admin.b@gov.in');
    const tokenA = await loginAdmin(baseUrl, 'admin.a@gov.in');
    const tokenB = await loginAdmin(baseUrl, 'admin.b@gov.in');

    const registration = await fetch(`${baseUrl}/api/auth/expert/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Pending Expert',
        email: 'pending@agency.gov',
        password: 'PendingPassword@123',
        organisation: 'Agency',
        designation: 'Responder',
        authorityId: 'AUTH_A'
      })
    });
    assert.equal(registration.status, 201);
    const applicationId = (await registration.json()).application.id as string;
    const pending = db.getUserByEmail('pending@agency.gov');
    assert.ok(pending);
    const pendingToken = generateToken(pending as User);
    const blocked = await fetch(`${baseUrl}/api/roads/R01/status`, {
      method: 'PATCH',
      headers: { ...bearer(pendingToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CLOSED', reason: 'Not approved' })
    });
    assert.equal(blocked.status, 403);

    const oldPeerRoute = await fetch(`${baseUrl}/api/expert/applications/${applicationId}/approve`, {
      method: 'PATCH',
      headers: bearer(pendingToken)
    });
    assert.equal(oldPeerRoute.status, 404);
    const expertAdminApi = await fetch(`${baseUrl}/api/authority/applications`, {
      headers: bearer(pendingToken)
    });
    assert.equal(expertAdminApi.status, 403);

    const wrongAuthorityApproval = await fetch(`${baseUrl}/api/authority/applications/${applicationId}/approve`, {
      method: 'PATCH',
      headers: bearer(tokenB)
    });
    assert.equal(wrongAuthorityApproval.status, 404);
    const approval = await fetch(`${baseUrl}/api/authority/applications/${applicationId}/approve`, {
      method: 'PATCH',
      headers: bearer(tokenA)
    });
    assert.equal(approval.status, 200);
    assert.equal(db.getUserByEmail('pending@agency.gov')?.accountStatus, 'ACTIVE');
  });
});

test('initial authority CLI initializes once and refuses a repeat run', () => {
  const dbPath = makeTmpDbPath('initial-setup');
  const env = {
    ...process.env,
    DATABASE_URL: dbPath,
    SEED_DEMO_ACCOUNTS: 'false',
    AUTHORITY_NAME: 'Test Authority',
    AUTHORITY_TYPE: 'GOVERNMENT',
    AUTHORITY_REGION: 'Pune',
    ADMIN_FULL_NAME: 'First Admin',
    ADMIN_EMAIL: 'first.admin@gov.in',
    ADMIN_PASSWORD: 'InitialAdminPassword@123'
  };
  const runSetup = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/initial-authority-setup.ts'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8'
  });

  const first = runSetup();
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const repeat = runSetup();
  assert.equal(repeat.status, 1);
  assert.match(repeat.stderr + repeat.stdout, /already been completed/i);
});
