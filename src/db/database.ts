import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {
  INITIAL_POLLS,
  INITIAL_ROAD_SEGMENTS,
  INITIAL_SHELTERS,
  PUNE_ROAD_NODES
} from '../data/puneData';
import {
  AccountStatus,
  AppNotification,
  AuditLog,
  CommunityReport,
  ExpertApplication,
  ExpertAlert,
  LivePoll,
  RoadSegment,
  RoadNode,
  RoadStatus,
  RouteFeedback,
  Shelter,
  User,
  UserRole,
  OsmSyncLog,
  OsmRoadMapping
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

    if (resolvedPath !== ':memory:') {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    }
    this.dbPath = resolvedPath;
    this.db = new DatabaseSync(resolvedPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
    this.seedInitialData();
    this.markInitialExpertBootstrapCompleteIfActive();
  }

  private migrate(): void {
    const schemaPath = path.resolve(process.cwd(), 'database', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    this.db.exec(sql);

    const existingV1 = this.db
      .prepare('SELECT version FROM schema_migrations WHERE version = 1')
      .get();
    if (!existingV1) {
      this.db
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(1, 'initial_sanketsetu_2role_schema', new Date().toISOString());
    }

    const existingV2 = this.db
      .prepare('SELECT version FROM schema_migrations WHERE version = 2')
      .get();
    if (!existingV2) {
      this.db
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(2, 'v2_osm_road_nodes_and_sync_log', new Date().toISOString());
    }

    const reportColumns = this.db
      .prepare('PRAGMA table_info(community_reports)')
      .all() as Array<{ name: string }>;
    if (!reportColumns.some(column => column.name === 'client_request_id')) {
      this.db.exec('ALTER TABLE community_reports ADD COLUMN client_request_id TEXT');
    }
    if (!reportColumns.some(column => column.name === 'is_demo')) {
      this.db.exec('ALTER TABLE community_reports ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0');
    }
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_community_reports_client_request
      ON community_reports(user_id, client_request_id)
      WHERE client_request_id IS NOT NULL
    `);

    const existingV3 = this.db
      .prepare('SELECT version FROM schema_migrations WHERE version = 3')
      .get();
    if (!existingV3) {
      this.db
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(3, 'v3_offline_report_idempotency', new Date().toISOString());
    }

    const existingV4 = this.db
      .prepare('SELECT version FROM schema_migrations WHERE version = 4')
      .get();
    if (!existingV4) {
      this.db.exec(`
        UPDATE community_reports
        SET is_demo = 1
        WHERE report_id IN ('REP_101', 'REP_102');

        UPDATE road_segments
        SET status = 'UNKNOWN'
        WHERE status = 'REPORTED_WATERLOGGING'
          AND verified_by IS NULL
          AND status_reason IS NULL;
      `);
      this.db
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(4, 'v4_exclude_demo_reports_and_clear_inferred_live_road_status', new Date().toISOString());
    }

    const applicationColumns = this.db
      .prepare('PRAGMA table_info(expert_applications)')
      .all() as Array<{ name: string }>;
    if (!applicationColumns.some(column => column.name === 'reviewed_by_id')) {
      this.db.exec('ALTER TABLE expert_applications ADD COLUMN reviewed_by_id TEXT');
    }

    const existingV5 = this.db
      .prepare('SELECT version FROM schema_migrations WHERE version = 5')
      .get();
    if (!existingV5) {
      this.db
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(5, 'v5_expert_reviewer_identity_and_one_time_bootstrap', new Date().toISOString());
    }
  }

  private markInitialExpertBootstrapCompleteIfActive(): void {
    const activeCount = (this.db
      .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'EXPERT' AND account_status = 'ACTIVE'")
      .get() as { count: number }).count;
    if (activeCount > 0) {
      this.db
        .prepare('UPDATE expert_bootstrap_state SET completed_at = COALESCE(completed_at, ?) WHERE singleton_id = 1')
        .run(new Date().toISOString());
    }
  }

  private seedInitialData(): void {
    const now = new Date().toISOString();

    // 1. Seed road nodes if empty
    const nodeCount = (this.db.prepare('SELECT COUNT(*) as c FROM road_nodes').get() as { c: number }).c;
    if (nodeCount === 0) {
      const insertNode = this.db.prepare(`
        INSERT INTO road_nodes (node_id, node_name, latitude, longitude, sector, elevation_m, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const node of Object.values(PUNE_ROAD_NODES)) {
        insertNode.run(
          node.id,
          node.name,
          node.lat,
          node.lng,
          node.sector ?? null,
          node.elevationM ?? null,
          now
        );
      }
    }

    // 2. Seed missing road segments from INITIAL_ROAD_SEGMENTS (preserving existing records & closures)
    const existingRoadRows = this.db.prepare('SELECT road_id FROM road_segments').all() as Array<{ road_id: string }>;
    const existingIds = new Set(existingRoadRows.map(r => r.road_id));

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
      if (!existingIds.has(r.id)) {
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

    // Development-only demo user seeding (STRICTLY two roles: CITIZEN and EXPERT; ZERO ADMIN)
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
            application_id, user_id, full_name, email, organisation, designation, status, applied_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
          application_id, user_id, full_name, email, organisation, designation, status, applied_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        appItem.id,
        appItem.userId,
        appItem.fullName,
        appItem.email,
        appItem.organisation,
        appItem.designation,
        appItem.status,
        appItem.appliedAt
      );
  }

  public createExpertRegistration(user: StoredUser, appItem: ExpertApplication): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.createUser(user);
      this.createExpertApplication(appItem);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private mapExpertApplicationRow(row: Record<string, unknown>): ExpertApplication {
    return {
      id: String(row.application_id),
      userId: String(row.user_id),
      fullName: String(row.full_name),
      email: String(row.email),
      organisation: String(row.organisation),
      designation: String(row.designation),
      status: String(row.status) as AccountStatus,
      appliedAt: String(row.applied_at),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
      reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
      reviewedById: row.reviewed_by_id ? String(row.reviewed_by_id) : undefined
    };
  }

  public getExpertApplications(): ExpertApplication[] {
    const rows = this.db
      .prepare('SELECT * FROM expert_applications ORDER BY applied_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map(row => this.mapExpertApplicationRow(row));
  }

  public getExpertApplicationById(applicationId: string): ExpertApplication | null {
    const row = this.db
      .prepare('SELECT * FROM expert_applications WHERE application_id = ?')
      .get(applicationId) as Record<string, unknown> | undefined;
    return row ? this.mapExpertApplicationRow(row) : null;
  }

  public getExpertApplicationForUser(userId: string): ExpertApplication | null {
    const row = this.db
      .prepare('SELECT * FROM expert_applications WHERE user_id = ? ORDER BY applied_at DESC LIMIT 1')
      .get(userId) as Record<string, unknown> | undefined;
    return row ? this.mapExpertApplicationRow(row) : null;
  }

  public updateExpertApplicationStatus(
    applicationId: string,
    status: 'ACTIVE' | 'REJECTED',
    reviewer: User
  ): ExpertApplication | null {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db
        .prepare('SELECT * FROM expert_applications WHERE application_id = ?')
        .get(applicationId) as Record<string, unknown> | undefined;
      if (!existing || existing.status !== 'PENDING_APPROVAL') {
        this.db.exec('ROLLBACK');
        return null;
      }

      const userId = String(existing.user_id);
      if (userId === reviewer.id) {
        this.db.exec('ROLLBACK');
        return null;
      }

      const now = new Date().toISOString();
      const appUpdate = this.db
        .prepare(`
          UPDATE expert_applications
          SET status = ?, reviewed_at = ?, reviewed_by = ?, reviewed_by_id = ?
          WHERE application_id = ? AND status = 'PENDING_APPROVAL'
        `)
        .run(status, now, reviewer.fullName, reviewer.id, applicationId);
      const userUpdate = this.db
        .prepare(`
          UPDATE users SET account_status = ?, updated_at = ?
          WHERE id = ? AND role = 'EXPERT' AND account_status = 'PENDING_APPROVAL'
        `)
        .run(status, now, userId);
      if (Number(appUpdate.changes) !== 1 || Number(userUpdate.changes) !== 1) {
        throw new Error('Expert application status changed during review.');
      }

      this.appendAuditLog(
        reviewer,
        status === 'ACTIVE' ? 'EXPERT_APPROVAL' : 'EXPERT_REJECTION',
        userId,
        `${status === 'ACTIVE' ? 'Approved' : 'Rejected'} expert application for ${String(existing.full_name)} (${String(existing.organisation)})`
      );
      if (status === 'ACTIVE') {
        this.createNotification({
          userId,
          title: 'Expert Account Approved',
          message: `Your SanketSetu Expert credentials (${String(existing.organisation)}) have been approved by ${reviewer.fullName}.`,
          severity: 'info'
        });
      }

      this.db.exec('COMMIT');
      return {
        ...this.mapExpertApplicationRow(existing),
        status,
        reviewedAt: now,
        reviewedBy: reviewer.fullName,
        reviewedById: reviewer.id
      };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  public bootstrapApproveExpertApplication(
    applicationId: string,
    reviewerId: string,
    reviewerName: string
  ):
    | { status: 'approved'; application: ExpertApplication }
    | { status: 'bootstrap_closed' | 'not_found' | 'not_pending' } {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const activeCount = (this.db
        .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'EXPERT' AND account_status = 'ACTIVE'")
        .get() as { count: number }).count;
      const bootstrapState = this.db
        .prepare('SELECT completed_at FROM expert_bootstrap_state WHERE singleton_id = 1')
        .get() as { completed_at: string | null } | undefined;
      if (activeCount > 0 || !bootstrapState || bootstrapState.completed_at) {
        if (activeCount > 0 && bootstrapState && !bootstrapState.completed_at) {
          this.db.prepare(`
            UPDATE expert_bootstrap_state SET completed_at = ? WHERE singleton_id = 1
          `).run(new Date().toISOString());
        }
        this.db.exec('COMMIT');
        return { status: 'bootstrap_closed' };
      }

      const existing = this.db
        .prepare('SELECT * FROM expert_applications WHERE application_id = ?')
        .get(applicationId) as Record<string, unknown> | undefined;
      if (!existing) {
        this.db.exec('ROLLBACK');
        return { status: 'not_found' };
      }
      if (existing.status !== 'PENDING_APPROVAL') {
        this.db.exec('ROLLBACK');
        return { status: 'not_pending' };
      }

      const now = new Date().toISOString();
      const userId = String(existing.user_id);
      const appUpdate = this.db
        .prepare(`
          UPDATE expert_applications
          SET status = 'ACTIVE', reviewed_at = ?, reviewed_by = ?, reviewed_by_id = ?
          WHERE application_id = ? AND status = 'PENDING_APPROVAL'
        `)
        .run(now, reviewerName, reviewerId, applicationId);
      const userUpdate = this.db
        .prepare(`
          UPDATE users SET account_status = 'ACTIVE', updated_at = ?
          WHERE id = ? AND role = 'EXPERT' AND account_status = 'PENDING_APPROVAL'
        `)
        .run(now, userId);
      const bootstrapUpdate = this.db
        .prepare(`
          UPDATE expert_bootstrap_state
          SET completed_at = ?, application_id = ?, reviewer_id = ?, reviewer_name = ?
          WHERE singleton_id = 1 AND completed_at IS NULL
        `)
        .run(now, applicationId, reviewerId, reviewerName);
      if (
        Number(appUpdate.changes) !== 1 ||
        Number(userUpdate.changes) !== 1 ||
        Number(bootstrapUpdate.changes) !== 1
      ) {
        throw new Error('Initial Expert bootstrap could not be completed atomically.');
      }

      const bootstrapReviewer: User = {
        id: reviewerId,
        fullName: reviewerName,
        email: '',
        role: 'EXPERT',
        accountStatus: 'ACTIVE',
        createdAt: now
      };
      this.appendAuditLog(
        bootstrapReviewer,
        'EXPERT_BOOTSTRAP_APPROVAL',
        userId,
        `Completed one-time initial Expert approval for ${String(existing.full_name)} (${String(existing.organisation)}).`
      );
      this.createNotification({
        userId,
        title: 'Expert Account Approved',
        message: 'Your SanketSetu Expert credentials have been approved through the one-time initial deployment setup.',
        severity: 'info'
      });

      this.db.exec('COMMIT');
      return {
        status: 'approved',
        application: {
          ...this.mapExpertApplicationRow(existing),
          status: 'ACTIVE',
          reviewedAt: now,
          reviewedBy: reviewerName,
          reviewedById: reviewerId
        }
      };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // ----------------- ROADS & UPDATES -----------------

  public getRoadSegments(): RoadSegment[] {
    const rows = this.db
      .prepare('SELECT * FROM road_segments ORDER BY road_id ASC')
      .all() as Record<string, unknown>[];
    return rows.map(r => ({
      id: String(r.road_id),
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
          update_id, road_id, previous_status, new_status, previous_risk, new_risk,
          reason, expires_at, updated_by_id, updated_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        `UPD_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        params.roadId,
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

  public getRoadNodes(): Record<string, RoadNode> {
    const rows = this.db.prepare('SELECT * FROM road_nodes ORDER BY node_id ASC').all() as Record<string, unknown>[];
    if (rows.length === 0) {
      return { ...PUNE_ROAD_NODES };
    }
    const result: Record<string, RoadNode> = {};
    for (const r of rows) {
      result[String(r.node_id)] = {
        id: String(r.node_id),
        name: String(r.node_name),
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        sector: r.sector ? String(r.sector) : undefined,
        elevationM: r.elevation_m === null ? null : Number(r.elevation_m)
      };
    }
    return result;
  }

  public saveRoadNodes(nodes: Record<string, RoadNode> | RoadNode[]): void {
    const list = Array.isArray(nodes) ? nodes : Object.values(nodes);
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO road_nodes (node_id, node_name, latitude, longitude, sector, elevation_m, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(node_id) DO UPDATE SET
        node_name = excluded.node_name,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        sector = excluded.sector,
        elevation_m = excluded.elevation_m,
        updated_at = excluded.updated_at
    `);
    for (const n of list) {
      stmt.run(n.id, n.name, n.lat, n.lng, n.sector ?? null, n.elevationM ?? null, now);
    }
  }

  public recordOsmSync(log: OsmSyncLog): void {
    this.db.prepare(`
      INSERT INTO osm_sync_log (
        sync_id, sync_type, status, nodes_count, edges_count,
        roads_preserved, roads_added, duration_ms, error_message, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.syncId,
      log.syncType,
      log.status,
      log.nodesCount,
      log.edgesCount,
      log.roadsPreserved,
      log.roadsAdded,
      log.durationMs,
      log.errorMessage ?? null,
      log.detailsJson ?? null,
      log.createdAt
    );
  }

  public getLatestOsmSync(): OsmSyncLog | null {
    const row = this.db.prepare('SELECT * FROM osm_sync_log ORDER BY created_at DESC LIMIT 1').get() as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      syncId: String(row.sync_id),
      syncType: row.sync_type as OsmSyncLog['syncType'],
      status: row.status as OsmSyncLog['status'],
      nodesCount: Number(row.nodes_count),
      edgesCount: Number(row.edges_count),
      roadsPreserved: Number(row.roads_preserved),
      roadsAdded: Number(row.roads_added),
      durationMs: Number(row.duration_ms),
      errorMessage: row.error_message ? String(row.error_message) : null,
      detailsJson: row.details_json ? String(row.details_json) : null,
      createdAt: String(row.created_at)
    };
  }

  public getOsmSyncLogs(limit = 10): OsmSyncLog[] {
    const rows = this.db.prepare('SELECT * FROM osm_sync_log ORDER BY created_at DESC LIMIT ?').all(limit) as Record<string, unknown>[];
    return rows.map(row => ({
      syncId: String(row.sync_id),
      syncType: row.sync_type as OsmSyncLog['syncType'],
      status: row.status as OsmSyncLog['status'],
      nodesCount: Number(row.nodes_count),
      edgesCount: Number(row.edges_count),
      roadsPreserved: Number(row.roads_preserved),
      roadsAdded: Number(row.roads_added),
      durationMs: Number(row.duration_ms),
      errorMessage: row.error_message ? String(row.error_message) : null,
      detailsJson: row.details_json ? String(row.details_json) : null,
      createdAt: String(row.created_at)
    }));
  }

  public getOsmRoadMappings(): OsmRoadMapping[] {
    const rows = this.db.prepare('SELECT * FROM osm_road_mappings').all() as Record<string, unknown>[];
    return rows.map(r => ({
      osmWayId: Number(r.osm_way_id),
      segmentIndex: Number(r.segment_index),
      mappedRoadId: String(r.mapped_road_id),
      fromNode: String(r.from_node),
      toNode: String(r.to_node),
      confidence: Number(r.confidence),
      createdAt: String(r.created_at)
    }));
  }

  public saveOsmRoadMappings(mappings: OsmRoadMapping[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO osm_road_mappings (osm_way_id, segment_index, mapped_road_id, from_node, to_node, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(osm_way_id, segment_index) DO UPDATE SET
        mapped_road_id = excluded.mapped_road_id,
        from_node = excluded.from_node,
        to_node = excluded.to_node,
        confidence = excluded.confidence
    `);
    for (const m of mappings) {
      stmt.run(m.osmWayId, m.segmentIndex, m.mappedRoadId, m.fromNode, m.toNode, m.confidence, m.createdAt);
    }
  }

  /**
   * Transactionally upsert the road network.
   * STRICT GUARANTEES:
   * 1. Preserves existing road IDs and foreign keys.
   * 2. Preserves expert closures ('CLOSED'), verified hazards ('VERIFIED_HAZARD'),
   *    verifiedBy, statusReason, and unexpired expiresAt.
   * 3. Inserts new road segments with appropriate defaults.
   * 4. Updates node geometries in road_nodes.
   */
  public upsertRoadNetwork(
    nodes: Record<string, RoadNode>,
    segments: RoadSegment[]
  ): { preserved: number; added: number; updated: number } {
    const now = new Date().toISOString();
    let preserved = 0;
    let added = 0;
    let updated = 0;

    const existingRows = this.db.prepare('SELECT * FROM road_segments').all() as Record<string, unknown>[];
    const existingMap = new Map<string, Record<string, unknown>>();
    for (const row of existingRows) {
      existingMap.set(String(row.road_id), row);
    }

    this.db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Save all nodes
      this.saveRoadNodes(nodes);

      // 2. Prepare statements for existing vs new segments
      const updateStmt = this.db.prepare(`
        UPDATE road_segments
        SET road_name = ?, from_node = ?, to_node = ?, road_type = ?, distance_km = ?,
            speed_kmph = ?, base_elevation_m = ?, slope_pct = ?, drainage_condition = ?,
            is_one_way = ?, access_restriction = ?, is_bridge = ?, is_tunnel = ?,
            surface = ?, has_historical_flood = ?, waterway_proximity = ?,
            coordinates_json = ?, geometry_source = ?, updated_at = ?
        WHERE road_id = ?
      `);

      const insertStmt = this.db.prepare(`
        INSERT INTO road_segments (
          road_id, road_name, from_node, to_node, road_type, distance_km, speed_kmph,
          base_elevation_m, slope_pct, drainage_condition, is_one_way, access_restriction,
          is_bridge, is_tunnel, surface, has_historical_flood, waterway_proximity,
          risk_score, risk_category, confidence_score, status, coordinates_json,
          geometry_source, verified_by, status_reason, expires_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const seg of segments) {
        const existing = existingMap.get(seg.id);
        if (existing) {
          const isClosedOrHazard = existing.status === 'CLOSED' || existing.status === 'VERIFIED_HAZARD';
          if (isClosedOrHazard) {
            preserved++;
          } else {
            updated++;
          }

          updateStmt.run(
            seg.name,
            seg.from,
            seg.to,
            seg.roadType,
            seg.distanceKm,
            seg.speedKmph,
            seg.baseElevationM,
            seg.slopePct,
            seg.drainageCondition,
            seg.isOneWay ? 1 : 0,
            seg.accessRestriction,
            seg.isBridge ? 1 : 0,
            seg.isTunnel ? 1 : 0,
            seg.surface || 'asphalt',
            seg.hasHistoricalFlood ? 1 : 0,
            seg.waterwayProximity ?? null,
            JSON.stringify(seg.coordinates),
            seg.geometrySource || 'OpenStreetMap Sync',
            now,
            seg.id
          );
        } else {
          added++;
          insertStmt.run(
            seg.id,
            seg.name,
            seg.from,
            seg.to,
            seg.roadType,
            seg.distanceKm,
            seg.speedKmph,
            seg.baseElevationM,
            seg.slopePct,
            seg.drainageCondition,
            seg.isOneWay ? 1 : 0,
            seg.accessRestriction,
            seg.isBridge ? 1 : 0,
            seg.isTunnel ? 1 : 0,
            seg.surface || 'asphalt',
            seg.hasHistoricalFlood ? 1 : 0,
            seg.waterwayProximity ?? null,
            seg.riskScore,
            seg.riskCategory,
            seg.confidenceScore,
            seg.status,
            JSON.stringify(seg.coordinates),
            seg.geometrySource || 'OpenStreetMap Sync',
            seg.verifiedBy ?? null,
            seg.statusReason ?? null,
            seg.expiresAt ?? null,
            now
          );
        }
      }

      this.db.exec('COMMIT;');
      return { preserved, added, updated };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  // ----------------- COMMUNITY REPORTS & VERIFIED HAZARDS -----------------

  public getReports(): CommunityReport[] {
    const rows = this.db
      .prepare('SELECT * FROM community_reports WHERE is_demo = 0 ORDER BY created_at DESC')
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

  public getReportByClientRequestId(userId: string, clientRequestId: string): CommunityReport | null {
    const row = this.db
      .prepare('SELECT report_id FROM community_reports WHERE user_id = ? AND client_request_id = ?')
      .get(userId, clientRequestId) as { report_id: string } | undefined;
    if (!row) return null;
    return this.getReports().find(report => report.id === row.report_id) ?? null;
  }

  public createReport(rep: CommunityReport, clientRequestId?: string): void {
    this.db
      .prepare(`
        INSERT INTO community_reports (
          report_id, user_id, user_name, road_id, location_name, latitude, longitude,
          report_type, description, severity, image_url, verification_status,
          confidence_score, client_request_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        clientRequestId ?? null,
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

  public getExpertAlerts(): ExpertAlert[] {
    const rows = this.db
      .prepare(`
        SELECT n.*, a.actor_id, a.actor_name
        FROM notifications n
        JOIN audit_logs a
          ON a.target_resource = n.notification_id
         AND a.action = 'EXPERT_ALERT_CREATE'
        ORDER BY n.created_at DESC
        LIMIT 100
      `)
      .all() as Record<string, unknown>[];
    return rows.map(row => ({
      id: String(row.notification_id),
      userId: row.user_id ? String(row.user_id) : undefined,
      title: String(row.title),
      message: String(row.message),
      severity: String(row.severity) as AppNotification['severity'],
      relatedRoadId: row.related_road_id ? String(row.related_road_id) : undefined,
      relatedReportId: row.related_report_id ? String(row.related_report_id) : undefined,
      isRead: Boolean(row.is_read),
      createdAt: String(row.created_at),
      createdById: String(row.actor_id),
      createdBy: String(row.actor_name),
      deliveryStatus: 'NOT_CONFIGURED'
    }));
  }

  public markNotificationRead(id: string): void {
    this.db.prepare('UPDATE notifications SET is_read = 1 WHERE notification_id = ?').run(id);
  }

  public appendAuditLog(actor: User, action: string, targetResource: string, details: string): AuditLog {
    const log: AuditLog = {
      id: `LOG_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      action,
      targetResource,
      details,
      timestamp: new Date().toISOString()
    };
    this.db
      .prepare(`
        INSERT INTO audit_logs (
          log_id, actor_id, actor_name, actor_role, action, target_resource, details, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        log.id,
        log.actorId,
        log.actorName,
        log.actorRole,
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
