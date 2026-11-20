import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  INITIAL_COMMUNITY_REPORTS,
  INITIAL_POLLS,
  INITIAL_ROAD_SEGMENTS,
  INITIAL_SHELTERS
} from '../data/puneData';
import {
  AccountStatus,
  AppNotification,
  AuthorityMembership,
  AuthorityPermission,
  AuditLog,
  CommunityReport,
  ExpertApplication,
  LivePoll,
  RoadSegment,
  RoadStatus,
  RouteFeedback,
  Shelter,
  User,
  UserRole
} from '../types';
import { hashPassword } from '../utils/auth';

export interface StoredUser extends User {
  passwordHash: string;
}

export class SanketSetuDatabase {
  public db: DatabaseSync;
  public dbPath: string;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ||
      process.env.DATABASE_URL ||
      path.resolve(process.cwd(), 'data', 'sanketsetu.db');

    const databaseAlreadyExisted = resolvedPath !== ':memory:' && fs.existsSync(resolvedPath);
    if (resolvedPath !== ':memory:') {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    }
    this.dbPath = resolvedPath;
    this.db = new DatabaseSync(resolvedPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (databaseAlreadyExisted && fs.statSync(resolvedPath).size > 0) {
      const hasMigrationsTable = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
      ).get();
      const migration = hasMigrationsTable
        ? this.db.prepare('SELECT version FROM schema_migrations WHERE version = 3').get()
        : undefined;
      if (!migration) {
        const backupPath = `${resolvedPath}.pre-authority-v3-${Date.now()}.bak`;
        this.db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
      }
    }
    this.migrate();
    this.seedInitialData();
  }

  private migrate(): void {
    const schemaPath = path.resolve(process.cwd(), 'database', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    this.db.exec(sql);

    const existing = this.db
      .prepare('SELECT version FROM schema_migrations WHERE version = 1')
      .get();
    if (!existing) {
      this.db
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(1, 'initial_sanketsetu_2role_schema', new Date().toISOString());
    }

    const authorityMigration = this.db
      .prepare('SELECT version FROM schema_migrations WHERE version = 2')
      .get();
    if (!authorityMigration) {
      this.db.exec('PRAGMA foreign_keys = OFF;');
      let transactionStarted = false;
      try {
        this.db.exec('BEGIN IMMEDIATE;');
        transactionStarted = true;
        this.db.exec(`
          CREATE TABLE users_v2 (
            id TEXT PRIMARY KEY,
            full_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'CITIZEN' CHECK (role IN ('CITIZEN', 'AUTHORITY_ADMIN', 'EXPERT')),
            account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'PENDING_APPROVAL', 'REJECTED', 'SUSPENDED')),
            organisation TEXT,
            designation TEXT,
            preferred_language TEXT DEFAULT 'en',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          INSERT INTO users_v2
            (id, full_name, email, phone, password_hash, role, account_status,
             organisation, designation, preferred_language, created_at, updated_at)
          SELECT id, full_name, email, phone, password_hash, role, account_status,
                 organisation, designation, preferred_language, created_at, updated_at
          FROM users;
          DROP TABLE users;
          ALTER TABLE users_v2 RENAME TO users;

          CREATE TABLE authorities (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            authority_type TEXT NOT NULL,
            region TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE authority_memberships (
            id TEXT PRIMARY KEY,
            authority_id TEXT NOT NULL REFERENCES authorities(id),
            user_id TEXT NOT NULL REFERENCES users(id),
            membership_role TEXT NOT NULL CHECK (membership_role IN ('AUTHORITY_ADMIN', 'EXPERT')),
            status TEXT NOT NULL CHECK (status IN ('INVITED', 'PENDING', 'ACTIVE', 'SUSPENDED')),
            created_by TEXT REFERENCES users(id),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE (authority_id, user_id)
          );
          CREATE UNIQUE INDEX idx_active_authority_membership_user
            ON authority_memberships(user_id) WHERE status = 'ACTIVE';
          CREATE INDEX idx_authority_memberships_authority
            ON authority_memberships(authority_id, status);
          CREATE INDEX idx_authority_memberships_user
            ON authority_memberships(user_id, status);

          CREATE TABLE authority_invitations (
            id TEXT PRIMARY KEY,
            authority_id TEXT NOT NULL REFERENCES authorities(id),
            email TEXT NOT NULL,
            intended_role TEXT NOT NULL CHECK (intended_role IN ('AUTHORITY_ADMIN', 'EXPERT')),
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            accepted_at TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
            invited_by TEXT NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL
          );
          CREATE INDEX idx_authority_invitations_authority
            ON authority_invitations(authority_id, status, expires_at);
          CREATE UNIQUE INDEX idx_pending_invitation_email
            ON authority_invitations(authority_id, email) WHERE status = 'PENDING';

          CREATE TABLE authority_permissions (
            id TEXT PRIMARY KEY,
            membership_id TEXT NOT NULL REFERENCES authority_memberships(id) ON DELETE CASCADE,
            permission TEXT NOT NULL CHECK (permission IN (
              'REPORTS_VIEW', 'REPORTS_VERIFY', 'ROAD_STATUS_UPDATE', 'HAZARD_VERIFY',
              'SHELTER_MANAGE', 'ALERT_CREATE', 'EXPERT_MANAGE', 'AUDIT_VIEW'
            )),
            assigned_by TEXT NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL,
            UNIQUE (membership_id, permission)
          );
          CREATE INDEX idx_authority_permissions_membership
            ON authority_permissions(membership_id);

          ALTER TABLE expert_applications ADD COLUMN authority_id TEXT REFERENCES authorities(id);
          CREATE INDEX idx_expert_applications_authority_status
            ON expert_applications(authority_id, status, applied_at);

          CREATE TABLE audit_logs_v2 (
            log_id TEXT PRIMARY KEY,
            actor_id TEXT NOT NULL,
            actor_name TEXT NOT NULL,
            actor_role TEXT NOT NULL CHECK (actor_role IN ('CITIZEN', 'AUTHORITY_ADMIN', 'EXPERT')),
            authority_id TEXT REFERENCES authorities(id),
            action TEXT NOT NULL,
            target_resource TEXT NOT NULL,
            details TEXT NOT NULL,
            timestamp TEXT NOT NULL
          );
          INSERT INTO audit_logs_v2
            (log_id, actor_id, actor_name, actor_role, action, target_resource, details, timestamp)
          SELECT log_id, actor_id, actor_name, actor_role, action, target_resource, details, timestamp
          FROM audit_logs;
          DROP TABLE audit_logs;
          ALTER TABLE audit_logs_v2 RENAME TO audit_logs;
          CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
          CREATE INDEX idx_audit_authority_timestamp ON audit_logs(authority_id, timestamp);

          INSERT INTO schema_migrations (version, name, applied_at)
          VALUES (2, 'authority_memberships_and_admin_access', '${new Date().toISOString()}');
        `);
        this.db.exec('COMMIT;');
        transactionStarted = false;
      } catch (error) {
        if (transactionStarted) this.db.exec('ROLLBACK;');
        throw error;
      } finally {
        this.db.exec('PRAGMA foreign_keys = ON;');
      }
    }

    const resourceScopeMigration = this.db
      .prepare('SELECT version FROM schema_migrations WHERE version = 3')
      .get();
    if (!resourceScopeMigration) {
      this.db.exec('BEGIN IMMEDIATE;');
      try {
        this.db.exec(`
          ALTER TABLE road_segments ADD COLUMN authority_id TEXT REFERENCES authorities(id);
          ALTER TABLE shelters ADD COLUMN authority_id TEXT REFERENCES authorities(id);
          ALTER TABLE road_updates ADD COLUMN authority_id TEXT REFERENCES authorities(id);
          CREATE INDEX idx_road_segments_authority ON road_segments(authority_id);
          CREATE INDEX idx_shelters_authority ON shelters(authority_id);
          CREATE INDEX idx_road_updates_authority ON road_updates(authority_id, created_at);

          UPDATE road_updates
          SET authority_id = (
            SELECT authority_id FROM road_segments WHERE road_segments.road_id = road_updates.road_id
          )
          WHERE authority_id IS NULL;
        `);

        const authorities = this.db.prepare('SELECT id FROM authorities').all() as { id: string }[];
        if (authorities.length === 1) {
          const authorityId = authorities[0].id;
          this.db.prepare('UPDATE road_segments SET authority_id = ? WHERE authority_id IS NULL')
            .run(authorityId);
          this.db.prepare('UPDATE shelters SET authority_id = ? WHERE authority_id IS NULL')
            .run(authorityId);
          this.db.prepare(`
            UPDATE road_updates
            SET authority_id = (
              SELECT authority_id FROM road_segments WHERE road_segments.road_id = road_updates.road_id
            )
            WHERE authority_id IS NULL
          `).run();
        }

        this.db.prepare(`
          INSERT INTO schema_migrations (version, name, applied_at)
          VALUES (3, 'authority_scoped_operational_resources', ?)
        `).run(new Date().toISOString());
        this.db.exec('COMMIT;');
      } catch (error) {
        this.db.exec('ROLLBACK;');
        throw error;
      }
    }

  }

  private seedInitialData(): void {
    const now = new Date().toISOString();

    // Seed roads from GeoJSON-backed INITIAL_ROAD_SEGMENTS if empty
    const roadCount = (this.db.prepare('SELECT COUNT(*) as c FROM road_segments').get() as { c: number }).c;
    if (roadCount === 0) {
      const insertRoad = this.db.prepare(`
        INSERT INTO road_segments (
          road_id, road_name, from_node, to_node, road_type, distance_km, speed_kmph,
          base_elevation_m, slope_pct, drainage_condition, is_one_way, access_restriction,
          is_bridge, is_tunnel, surface, has_historical_flood, waterway_proximity,
          risk_score, risk_category, confidence_score, status, coordinates_json,
          geometry_source, verified_by, status_reason, expires_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of INITIAL_ROAD_SEGMENTS) {
        insertRoad.run(
          r.id,
          r.name,
          r.from,
          r.to,
          r.roadType,
          r.distanceKm,
          r.speedKmph,
          r.baseElevationM,
          r.slopePct,
          r.drainageCondition,
          r.isOneWay ? 1 : 0,
          r.accessRestriction,
          r.isBridge ? 1 : 0,
          r.isTunnel ? 1 : 0,
          r.surface || 'asphalt',
          r.hasHistoricalFlood ? 1 : 0,
          r.waterwayProximity ?? null,
          r.riskScore,
          r.riskCategory,
          r.confidenceScore,
          r.status,
          JSON.stringify(r.coordinates),
          r.geometrySource || 'OpenStreetMap via OSRM',
          r.verifiedBy ?? null,
          r.statusReason ?? null,
          r.expiresAt ?? null,
          r.lastUpdated || now
        );
      }
    }

    // Seed shelters if empty
    const shelterCount = (this.db.prepare('SELECT COUNT(*) as c FROM shelters').get() as { c: number }).c;
    if (shelterCount === 0) {
      const insertShelter = this.db.prepare(`
        INSERT INTO shelters (
          shelter_id, name, latitude, longitude, capacity, current_occupancy,
          pet_friendly, wheelchair_accessible, contact, address, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of INITIAL_SHELTERS) {
        insertShelter.run(
          s.id,
          s.name,
          s.lat,
          s.lng,
          s.capacity,
          s.currentOccupancy,
          s.petFriendly ? 1 : 0,
          s.wheelchairAccessible ? 1 : 0,
          s.contact,
          s.address,
          s.lastUpdated
        );
      }
    }

    // Seed polls if empty
    const pollCount = (this.db.prepare('SELECT COUNT(*) as c FROM live_polls').get() as { c: number }).c;
    if (pollCount === 0) {
      const insertPoll = this.db.prepare(`
        INSERT INTO live_polls (
          poll_id, road_id, road_name, question, options_json, votes_json, total_votes, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of INITIAL_POLLS) {
        insertPoll.run(
          p.id,
          p.roadId,
          p.roadName,
          p.question,
          JSON.stringify(p.options),
          JSON.stringify(p.votes),
          p.totalVotes,
          p.isActive ? 1 : 0,
          now
        );
      }
    }

    // Seed community reports if empty
    const reportCount = (this.db.prepare('SELECT COUNT(*) as c FROM community_reports').get() as { c: number }).c;
    if (reportCount === 0) {
      const insertReport = this.db.prepare(`
        INSERT INTO community_reports (
          report_id, user_id, user_name, road_id, location_name, latitude, longitude,
          report_type, description, severity, image_url, verification_status,
          confidence_score, reviewed_by, review_notes, reviewed_at, resolved_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const rep of INITIAL_COMMUNITY_REPORTS) {
        insertReport.run(
          rep.id,
          rep.userId,
          rep.userName || 'Citizen Reporter',
          rep.roadId ?? null,
          rep.locationName,
          rep.lat,
          rep.lng,
          rep.reportType,
          rep.description,
          rep.severity,
          rep.imageUrl ?? null,
          rep.verificationStatus,
          rep.confidenceScore,
          rep.reviewedBy ?? null,
          rep.reviewNotes ?? null,
          rep.reviewedAt ?? null,
          rep.resolvedAt ?? null,
          rep.timestamp
        );
      }
    }

    // Development-only citizen and Expert demo accounts.
    const shouldSeedDemo =
      process.env.NODE_ENV !== 'production' &&
      process.env.SEED_DEMO_ACCOUNTS !== 'false';

    const userCount = (this.db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
    if (shouldSeedDemo && userCount === 0) {
      const insertUser = this.db.prepare(`
        INSERT INTO users (
          id, full_name, email, phone, password_hash, role, account_status,
          organisation, designation, preferred_language, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertUser.run(
        'USR_CITIZEN_01',
        'Anjali Sharma',
        'citizen@pune.in',
        '+91-9822012345',
        hashPassword('Citizen@123'),
        'CITIZEN',
        'ACTIVE',
        null,
        null,
        'en',
        now,
        now
      );

      insertUser.run(
        'USR_EXPERT_01',
        'Dr. Rajiv Kulkarni',
        'officer.kulkarni@pmc.gov.in',
        '+91-9823098765',
        hashPassword('Expert@123'),
        'EXPERT',
        'ACTIVE',
        'Pune Municipal Disaster Management Cell',
        'Senior Disaster Management Officer',
        'en',
        now,
        now
      );

      insertUser.run(
        'USR_EXPERT_PENDING_01',
        'Capt. Vikram Deshmukh',
        'deshmukh@ndrf.gov.in',
        '+91-9824055555',
        hashPassword('Expert@123'),
        'EXPERT',
        'PENDING_APPROVAL',
        'NDRF 5th Battalion Talegaon',
        'Deputy Commandant Flood Operations',
        'en',
        now,
        now
      );

      this.db
        .prepare(`
          INSERT INTO expert_applications (
            application_id, user_id, full_name, email, organisation, designation, status, applied_at, authority_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'APP_01',
          'USR_EXPERT_PENDING_01',
          'Capt. Vikram Deshmukh',
          'deshmukh@ndrf.gov.in',
          'NDRF 5th Battalion Talegaon',
          'Deputy Commandant Flood Operations',
          'PENDING_APPROVAL',
          now
        );

      this.db
        .prepare(`
          INSERT INTO notifications (
            notification_id, user_id, title, message, severity, related_road_id, is_read, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'NOTIF_WELCOME_01',
          null,
          'SanketSetu Monsoon Monitoring Active',
          'Live Open-Meteo rainfall telemetry and Pune/PCMC road graph are online. Watch Mutha & Pavana riverside corridors during heavy rainfall.',
          'info',
          'R08',
          0,
          now
        );

      this.db
        .prepare(`
          INSERT INTO audit_logs (
            log_id, actor_id, actor_name, actor_role, action, target_resource, details, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'LOG_INIT_01',
          'USR_EXPERT_01',
          'Dr. Rajiv Kulkarni',
          'EXPERT',
          'SYSTEM_BASELINE_VERIFICATION',
          'R08 (Sinhagad Road - Dandekar Bridge)',
          'Confirmed historical flood basin baseline advisory along Mutha riverside.',
          now
        );
    }
  }

  // ----------------- USERS & EXPERT APPLICATIONS -----------------

  public getUserByEmail(email: string): StoredUser | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email.trim()) as Record<string, unknown> | undefined;
    return row ? this.mapUserRow(row) : null;
  }

  public getUserById(id: string): StoredUser | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapUserRow(row) : null;
  }

  public getActiveAuthorityMembership(userId: string): AuthorityMembership | null {
    const row = this.db.prepare(`
      SELECT m.id, m.authority_id, m.membership_role, m.status,
             a.name AS authority_name, a.region AS authority_region
      FROM authority_memberships m
      JOIN authorities a ON a.id = m.authority_id
      WHERE m.user_id = ? AND m.status = 'ACTIVE' AND a.status = 'ACTIVE'
    `).get(userId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const permissions = this.db.prepare(
      'SELECT permission FROM authority_permissions WHERE membership_id = ? ORDER BY permission'
    ).all(String(row.id)) as { permission: string }[];

    return {
      id: String(row.id),
      authorityId: String(row.authority_id),
      authorityName: String(row.authority_name),
      authorityRegion: String(row.authority_region),
      role: String(row.membership_role) as AuthorityMembership['role'],
      status: String(row.status) as AuthorityMembership['status'],
      permissions: permissions.map(item => item.permission as AuthorityPermission)
    };
  }

  private mapUserRow(row: Record<string, unknown>): StoredUser {
    return {
      id: String(row.id),
      fullName: String(row.full_name),
      email: String(row.email),
      phone: row.phone ? String(row.phone) : undefined,
      passwordHash: String(row.password_hash),
      role: String(row.role) as UserRole,
      accountStatus: String(row.account_status) as AccountStatus,
      organisation: row.organisation ? String(row.organisation) : undefined,
      designation: row.designation ? String(row.designation) : undefined,
      preferredLanguage: (row.preferred_language as 'en' | 'hi' | 'mr') || 'en',
      createdAt: String(row.created_at)
    };
  }

  public createUser(user: StoredUser): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO users (
          id, full_name, email, phone, password_hash, role, account_status,
          organisation, designation, preferred_language, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        user.id,
        user.fullName,
        user.email.toLowerCase(),
        user.phone ?? null,
        user.passwordHash,
        user.role,
        user.accountStatus,
        user.organisation ?? null,
        user.designation ?? null,
        user.preferredLanguage || 'en',
        user.createdAt,
        now
      );
  }

  public createExpertApplication(appItem: ExpertApplication): void {
    this.db
      .prepare(`
        INSERT INTO expert_applications (
          application_id, user_id, full_name, email, organisation, designation, status, applied_at, authority_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        appItem.id,
        appItem.userId,
        appItem.fullName,
        appItem.email,
        appItem.organisation,
        appItem.designation,
        appItem.status,
        appItem.appliedAt,
        appItem.authorityId ?? null
      );
  }

  public getExpertApplications(): ExpertApplication[] {
    const rows = this.db
      .prepare('SELECT * FROM expert_applications ORDER BY applied_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map(r => ({
      id: String(r.application_id),
      userId: String(r.user_id),
      fullName: String(r.full_name),
      email: String(r.email),
      organisation: String(r.organisation),
      designation: String(r.designation),
      status: String(r.status) as AccountStatus,
      appliedAt: String(r.applied_at),
      reviewedAt: r.reviewed_at ? String(r.reviewed_at) : undefined,
      reviewedBy: r.reviewed_by ? String(r.reviewed_by) : undefined,
      authorityId: r.authority_id ? String(r.authority_id) : undefined
    }));
  }

  public updateExpertApplicationStatus(
    applicationId: string,
    status: AccountStatus,
    reviewerName: string
  ): ExpertApplication | null {
    const existing = this.db
      .prepare('SELECT * FROM expert_applications WHERE application_id = ?')
      .get(applicationId) as Record<string, unknown> | undefined;
    if (!existing) return null;

    const now = new Date().toISOString();
    this.db
      .prepare(`
        UPDATE expert_applications
        SET status = ?, reviewed_at = ?, reviewed_by = ?
        WHERE application_id = ?
      `)
      .run(status, now, reviewerName, applicationId);

    this.db
      .prepare('UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, String(existing.user_id));

    return {
      id: String(existing.application_id),
      userId: String(existing.user_id),
      fullName: String(existing.full_name),
      email: String(existing.email),
      organisation: String(existing.organisation),
      designation: String(existing.designation),
      status,
      appliedAt: String(existing.applied_at),
      reviewedAt: now,
      reviewedBy: reviewerName
    };
  }

  // ----------------- ROADS & UPDATES -----------------

  public getRoadSegments(): RoadSegment[] {
    const rows = this.db
      .prepare('SELECT * FROM road_segments ORDER BY road_id ASC')
      .all() as Record<string, unknown>[];
    return rows.map(r => ({
      id: String(r.road_id),
      authorityId: r.authority_id ? String(r.authority_id) : undefined,
      name: String(r.road_name),
      from: String(r.from_node),
      to: String(r.to_node),
      distanceKm: Number(r.distance_km),
      speedKmph: Number(r.speed_kmph),
      roadType: String(r.road_type) as RoadSegment['roadType'],
      baseElevationM: r.base_elevation_m === null ? null : Number(r.base_elevation_m),
      slopePct: r.slope_pct === null ? null : Number(r.slope_pct),
      drainageCondition: String(r.drainage_condition) as RoadSegment['drainageCondition'],
      isOneWay: Boolean(r.is_one_way),
      accessRestriction: String(r.access_restriction) as RoadSegment['accessRestriction'],
      isBridge: Boolean(r.is_bridge),
      isTunnel: Boolean(r.is_tunnel),
      surface: r.surface ? String(r.surface) : 'asphalt',
      hasHistoricalFlood: Boolean(r.has_historical_flood),
      waterwayProximity: r.waterway_proximity ? String(r.waterway_proximity) : null,
      riskScore: r.risk_score === null ? null : Number(r.risk_score),
      riskCategory: String(r.risk_category) as RoadSegment['riskCategory'],
      confidenceScore: Number(r.confidence_score),
      status: String(r.status) as RoadStatus,
      coordinates: JSON.parse(String(r.coordinates_json)),
      geometrySource: r.geometry_source ? String(r.geometry_source) : undefined,
      verifiedBy: r.verified_by ? String(r.verified_by) : undefined,
      statusReason: r.status_reason ? String(r.status_reason) : undefined,
      expiresAt: r.expires_at ? String(r.expires_at) : null,
      lastUpdated: String(r.updated_at)
    }));
  }

  public saveRoadSegments(roads: RoadSegment[]): void {
    const stmt = this.db.prepare(`
      UPDATE road_segments
      SET risk_score = ?, risk_category = ?, confidence_score = ?, status = ?,
          status_reason = ?, expires_at = ?, updated_at = ?
      WHERE road_id = ?
    `);
    for (const r of roads) {
      stmt.run(
        r.riskScore,
        r.riskCategory,
        r.confidenceScore,
        r.status,
        r.statusReason ?? null,
        r.expiresAt ?? null,
        r.lastUpdated || new Date().toISOString(),
        r.id
      );
    }
  }

  public updateRoadStatus(params: {
    roadId: string;
    status: RoadStatus;
    riskScore: number | null;
    riskCategory: RoadSegment['riskCategory'];
    reason: string;
    expiresAt?: string | null;
    actor: User;
  }): RoadSegment | null {
    const current = this.getRoadSegments().find(r => r.id === params.roadId);
    if (!current) return null;

    const now = new Date().toISOString();
    this.db
      .prepare(`
        UPDATE road_segments
        SET status = ?, risk_score = ?, risk_category = ?, verified_by = ?,
            status_reason = ?, expires_at = ?, updated_at = ?
        WHERE road_id = ?
      `)
      .run(
        params.status,
        params.riskScore,
        params.riskCategory,
        params.actor.fullName,
        params.reason,
        params.expiresAt ?? null,
        now,
        params.roadId
      );

    this.db
      .prepare(`
        INSERT INTO road_updates (
          update_id, road_id, authority_id, previous_status, new_status, previous_risk, new_risk,
          reason, expires_at, updated_by_id, updated_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        `UPD_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        params.roadId,
        current.authorityId ?? null,
        current.status,
        params.status,
        current.riskScore,
        params.riskScore,
        params.reason,
        params.expiresAt ?? null,
        params.actor.id,
        params.actor.fullName,
        now
      );

    return this.getRoadSegments().find(r => r.id === params.roadId) || null;
  }

  // ----------------- COMMUNITY REPORTS & VERIFIED HAZARDS -----------------

  public getReports(): CommunityReport[] {
    const rows = this.db
      .prepare('SELECT * FROM community_reports ORDER BY created_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map(r => ({
      id: String(r.report_id),
      userId: String(r.user_id),
      userName: r.user_name ? String(r.user_name) : undefined,
      roadId: r.road_id ? String(r.road_id) : undefined,
      locationName: String(r.location_name),
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      reportType: String(r.report_type) as CommunityReport['reportType'],
      description: String(r.description),
      severity: String(r.severity) as CommunityReport['severity'],
      imageUrl: r.image_url ? String(r.image_url) : undefined,
      timestamp: String(r.created_at),
      verificationStatus: String(r.verification_status) as CommunityReport['verificationStatus'],
      confidenceScore: Number(r.confidence_score),
      reviewedBy: r.reviewed_by ? String(r.reviewed_by) : undefined,
      reviewNotes: r.review_notes ? String(r.review_notes) : undefined,
      reviewedAt: r.reviewed_at ? String(r.reviewed_at) : undefined,
      resolvedAt: r.resolved_at ? String(r.resolved_at) : undefined
    }));
  }

  public createReport(rep: CommunityReport): void {
    this.db
      .prepare(`
        INSERT INTO community_reports (
          report_id, user_id, user_name, road_id, location_name, latitude, longitude,
          report_type, description, severity, image_url, verification_status,
          confidence_score, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        rep.id,
        rep.userId,
        rep.userName ?? null,
        rep.roadId ?? null,
        rep.locationName,
        rep.lat,
        rep.lng,
        rep.reportType,
        rep.description,
        rep.severity,
        rep.imageUrl ?? null,
        rep.verificationStatus,
        rep.confidenceScore,
        rep.timestamp
      );
  }

  public updateReportVerification(params: {
    reportId: string;
    verificationStatus: CommunityReport['verificationStatus'];
    confidenceScore: number;
    reviewedBy: string;
    reviewNotes?: string;
    resolvedAt?: string;
  }): CommunityReport | null {
    const existing = this.getReports().find(r => r.id === params.reportId);
    if (!existing) return null;

    const now = new Date().toISOString();
    this.db
      .prepare(`
        UPDATE community_reports
        SET verification_status = ?, confidence_score = ?, reviewed_by = ?,
            review_notes = ?, reviewed_at = ?, resolved_at = ?
        WHERE report_id = ?
      `)
      .run(
        params.verificationStatus,
        params.confidenceScore,
        params.reviewedBy,
        params.reviewNotes ?? existing.reviewNotes ?? null,
        now,
        params.resolvedAt ?? existing.resolvedAt ?? null,
        params.reportId
      );

    return this.getReports().find(r => r.id === params.reportId) || null;
  }

  public createVerifiedHazard(params: {
    reportId?: string;
    roadId: string;
    hazardType: string;
    severity: string;
    description: string;
    actor: User;
    expiresAt?: string | null;
  }): void {
    this.db
      .prepare(`
        INSERT INTO verified_hazards (
          hazard_id, report_id, road_id, hazard_type, severity, description,
          verified_by_id, verified_by_name, is_active, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `)
      .run(
        `HAZ_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        params.reportId ?? null,
        params.roadId,
        params.hazardType,
        params.severity,
        params.description,
        params.actor.id,
        params.actor.fullName,
        params.expiresAt ?? null,
        new Date().toISOString()
      );
  }

  // ----------------- SHELTERS, POLLS, FEEDBACK -----------------

  public getShelters(): Shelter[] {
    const rows = this.db.prepare('SELECT * FROM shelters ORDER BY shelter_id ASC').all() as Record<string, unknown>[];
    return rows.map(r => ({
      id: String(r.shelter_id),
      authorityId: r.authority_id ? String(r.authority_id) : undefined,
      name: String(r.name),
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      capacity: Number(r.capacity),
      currentOccupancy: Number(r.current_occupancy),
      petFriendly: Boolean(r.pet_friendly),
      wheelchairAccessible: Boolean(r.wheelchair_accessible),
      contact: String(r.contact),
      address: String(r.address),
      lastUpdated: String(r.last_updated)
    }));
  }

  public updateShelter(id: string, currentOccupancy?: number, capacity?: number): Shelter | null {
    const existing = this.getShelters().find(s => s.id === id);
    if (!existing) return null;
    const nextOcc = typeof currentOccupancy === 'number' ? Math.max(0, currentOccupancy) : existing.currentOccupancy;
    const nextCap = typeof capacity === 'number' ? Math.max(1, capacity) : existing.capacity;
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE shelters SET current_occupancy = ?, capacity = ?, last_updated = ? WHERE shelter_id = ?')
      .run(nextOcc, nextCap, now, id);
    return this.getShelters().find(s => s.id === id) || null;
  }

  public getPolls(userId?: string): LivePoll[] {
    const rows = this.db.prepare('SELECT * FROM live_polls ORDER BY poll_id ASC').all() as Record<string, unknown>[];
    const userVotes: Record<string, string> = {};
    if (userId) {
      const vRows = this.db
        .prepare('SELECT poll_id, selected_option FROM poll_votes WHERE user_id = ?')
        .all(userId) as { poll_id: string; selected_option: string }[];
      for (const vr of vRows) userVotes[vr.poll_id] = vr.selected_option;
    }
    return rows.map(r => ({
      id: String(r.poll_id),
      roadId: String(r.road_id),
      roadName: String(r.road_name),
      question: String(r.question),
      options: JSON.parse(String(r.options_json)),
      votes: JSON.parse(String(r.votes_json)),
      totalVotes: Number(r.total_votes),
      userVotedOption: userVotes[String(r.poll_id)],
      isActive: Boolean(r.is_active)
    }));
  }

  public castPollVote(pollId: string, userId: string, option: string): {
    ok: boolean;
    error?: string;
    poll?: LivePoll;
  } {
    const row = this.db
      .prepare('SELECT * FROM live_polls WHERE poll_id = ?')
      .get(pollId) as Record<string, unknown> | undefined;
    if (!row) return { ok: false, error: 'Poll not found' };

    const options: string[] = JSON.parse(String(row.options_json));
    if (!options.includes(option)) return { ok: false, error: 'Invalid poll option' };

    const already = this.db
      .prepare('SELECT selected_option FROM poll_votes WHERE poll_id = ? AND user_id = ?')
      .get(pollId, userId) as { selected_option: string } | undefined;
    if (already) {
      return { ok: false, error: `You have already voted ("${already.selected_option}") in this poll.` };
    }

    const votes: Record<string, number> = JSON.parse(String(row.votes_json));
    votes[option] = (votes[option] || 0) + 1;
    const totalVotes = Number(row.total_votes) + 1;

    this.db
      .prepare('INSERT INTO poll_votes (poll_id, user_id, selected_option, voted_at) VALUES (?, ?, ?, ?)')
      .run(pollId, userId, option, new Date().toISOString());

    this.db
      .prepare('UPDATE live_polls SET votes_json = ?, total_votes = ? WHERE poll_id = ?')
      .run(JSON.stringify(votes), totalVotes, pollId);

    const updated = this.getPolls(userId).find(p => p.id === pollId);
    return { ok: true, poll: updated };
  }

  public getRouteFeedback(): RouteFeedback[] {
    const rows = this.db
      .prepare('SELECT * FROM route_feedback ORDER BY created_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map(r => ({
      id: String(r.feedback_id),
      userId: String(r.user_id),
      userName: r.user_name ? String(r.user_name) : undefined,
      routeName: String(r.route_name),
      reachedSafely: Boolean(r.reached_safely),
      routeCondition: String(r.route_condition),
      waterLevelCategory: String(r.water_level_category),
      travelTimeMins: Number(r.travel_time_mins),
      rating: Number(r.rating),
      timestamp: String(r.created_at)
    }));
  }

  public createRouteFeedback(fb: RouteFeedback): void {
    this.db
      .prepare(`
        INSERT INTO route_feedback (
          feedback_id, user_id, user_name, route_name, reached_safely,
          route_condition, water_level_category, travel_time_mins, rating, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        fb.id,
        fb.userId,
        fb.userName ?? null,
        fb.routeName,
        fb.reachedSafely ? 1 : 0,
        fb.routeCondition,
        fb.waterLevelCategory,
        fb.travelTimeMins,
        fb.rating,
        fb.timestamp
      );
  }

  // ----------------- NOTIFICATIONS & AUDIT LOGS -----------------

  public createNotification(n: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>): AppNotification {
    const id = `NOTIF_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const createdAt = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO notifications (
          notification_id, user_id, title, message, severity, related_road_id, related_report_id, is_read, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `)
      .run(
        id,
        n.userId ?? null,
        n.title,
        n.message,
        n.severity,
        n.relatedRoadId ?? null,
        n.relatedReportId ?? null,
        createdAt
      );
    return {
      id,
      userId: n.userId,
      title: n.title,
      message: n.message,
      severity: n.severity,
      relatedRoadId: n.relatedRoadId,
      relatedReportId: n.relatedReportId,
      isRead: false,
      createdAt
    };
  }

  public getNotificationsForUser(userId?: string): AppNotification[] {
    const rows = userId
      ? (this.db
          .prepare('SELECT * FROM notifications WHERE user_id IS NULL OR user_id = ? ORDER BY created_at DESC LIMIT 50')
          .all(userId) as Record<string, unknown>[])
      : (this.db
          .prepare('SELECT * FROM notifications WHERE user_id IS NULL ORDER BY created_at DESC LIMIT 50')
          .all() as Record<string, unknown>[]);

    return rows.map(r => ({
      id: String(r.notification_id),
      userId: r.user_id ? String(r.user_id) : undefined,
      title: String(r.title),
      message: String(r.message),
      severity: String(r.severity) as AppNotification['severity'],
      relatedRoadId: r.related_road_id ? String(r.related_road_id) : undefined,
      relatedReportId: r.related_report_id ? String(r.related_report_id) : undefined,
      isRead: Boolean(r.is_read),
      createdAt: String(r.created_at)
    }));
  }

  public markNotificationRead(id: string): void {
    this.db.prepare('UPDATE notifications SET is_read = 1 WHERE notification_id = ?').run(id);
  }

  public appendAuditLog(
    actor: User,
    action: string,
    targetResource: string,
    details: string,
    authorityId?: string
  ): AuditLog {
    return this.appendAuthorityAuditLog(actor, authorityId, action, targetResource, details);
  }

  public appendAuthorityAuditLog(
    actor: User,
    authorityId: string | undefined,
    action: string,
    targetResource: string,
    details: string
  ): AuditLog {
    const log: AuditLog = {
      id: `LOG_${crypto.randomUUID()}`,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      action,
      targetResource,
      details,
      timestamp: new Date().toISOString(),
      authorityId
    };
    this.db
      .prepare(`
        INSERT INTO audit_logs (
          log_id, actor_id, actor_name, actor_role, authority_id, action, target_resource, details, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        log.id,
        log.actorId,
        log.actorName,
        log.actorRole,
        authorityId ?? null,
        log.action,
        log.targetResource,
        log.details,
        log.timestamp
      );
    return log;
  }

  public getAuditLogs(): AuditLog[] {
    const rows = this.db
      .prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 150')
      .all() as Record<string, unknown>[];
    return rows.map(r => ({
      id: String(r.log_id),
      actorId: String(r.actor_id),
      actorName: String(r.actor_name),
      actorRole: String(r.actor_role) as UserRole,
      authorityId: r.authority_id ? String(r.authority_id) : undefined,
      action: String(r.action),
      targetResource: String(r.target_resource),
      details: String(r.details),
      timestamp: String(r.timestamp)
    }));
  }

  public close(): void {
    this.db.close();
  }
}
