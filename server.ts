import express, { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import {
  PUNE_ROAD_NODES,
  INITIAL_HOSPITALS,
  INITIAL_EMERGENCY_FACILITIES,
  INITIAL_HISTORICAL_FLOODS,
  INITIAL_WATERWAYS
} from './src/data/puneData';
import { SanketSetuDatabase } from './src/db/database';
import { getLiveRainfallFeed, recomputeRoadRisksFromTelemetry } from './src/services/weatherService';
import {
  calculateFloodRisk,
  calculateDijkstraRoute,
  calculateKShortestPaths,
  calculatePollBreakdown,
  classifyRiskScore,
  GraphEdge,
  snapCoordinateToRoadNetwork
} from './src/utils/rules';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  decodeToken
} from './src/utils/auth';
import {
  CommunityReport,
  ExpertApplication,
  RoadSegment,
  RoadStatus,
  RouteFeedback,
  AuthorityMembership,
  AuthorityPermission,
  User
} from './src/types';

dotenv.config();

export interface AuthenticatedRequest extends Request {
  user?: User;
  authorityMembership?: AuthorityMembership;
}

const AUTHORITY_PERMISSIONS: AuthorityPermission[] = [
  'REPORTS_VIEW',
  'REPORTS_VERIFY',
  'ROAD_STATUS_UPDATE',
  'HAZARD_VERIFY',
  'SHELTER_MANAGE',
  'ALERT_CREATE',
  'EXPERT_MANAGE',
  'AUDIT_VIEW'
];

const PUNE_BOUNDS = {
  minLat: 18.30,
  maxLat: 18.80,
  minLng: 73.58,
  maxLng: 74.12
};

function isValidPuneCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= PUNE_BOUNDS.minLat &&
    lat <= PUNE_BOUNDS.maxLat &&
    lng >= PUNE_BOUNDS.minLng &&
    lng <= PUNE_BOUNDS.maxLng
  );
}

function validateOptionalDataImage(imageUrl: unknown): { ok: boolean; error?: string; value?: string } {
  if (imageUrl === undefined || imageUrl === null || imageUrl === '') {
    return { ok: true, value: undefined };
  }
  if (typeof imageUrl !== 'string') {
    return { ok: false, error: 'Invalid photo format.' };
  }
  const match = imageUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return { ok: false, error: 'Photo must be a valid PNG, JPEG, or WEBP image.' };
  }
  // Base64 length check (~2.5 MB limit)
  if (match[2].length > 3_500_000) {
    return { ok: false, error: 'Uploaded image exceeds 2.5 MB limit.' };
  }
  return { ok: true, value: imageUrl };
}

function createRateLimiter(windowMs: number, maxRequests: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (hits.get(key) || []).filter(ts => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

export function createSanketSetuApp(dbPath?: string) {
  if (process.env.NODE_ENV === 'production' && (process.env.SESSION_SECRET || '').length < 16) {
    throw new Error('SESSION_SECRET must be configured with at least 16 characters in production.');
  }
  const app = express();
  const db = new SanketSetuDatabase(dbPath);

  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.use(express.json({ limit: '4mb' }));

  // Initialize Gemini client strictly server-side
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  let aiClient: GoogleGenAI | null = null;
  if (geminiApiKey) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    } catch (err) {
      console.warn('[SanketSetu] Failed to initialize GoogleGenAI client:', err);
    }
  }

  const authLimiter = createRateLimiter(60_000, 40);
  const writeLimiter = createRateLimiter(60_000, 60);
  const invitationLimiter = createRateLimiter(60_000, 10);

  // ----------------- Auth Middleware -----------------

  function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      const decoded = decodeToken(token);
      if (decoded) {
        const found = db.getUserById(decoded.userId);
        if (found && found.accountStatus !== 'SUSPENDED') {
          const { passwordHash, ...safeUser } = found;
          req.user = safeUser;
        }
      }
    }
    next();
  }

  function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const decoded = decodeToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired session token. Please log in again.' });
    }
    const found = db.getUserById(decoded.userId);
    if (!found) {
      return res.status(401).json({ error: 'User account no longer exists.' });
    }
    if (found.accountStatus === 'SUSPENDED') {
      return res.status(403).json({ error: 'Your account has been suspended.' });
    }
    const { passwordHash, ...safeUser } = found;
    req.user = safeUser;
    next();
  }

  function requireAuthorityRole(role: 'AUTHORITY_ADMIN' | 'EXPERT') {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
      if (req.user.role !== role) return res.status(403).json({ error: `Access denied. Requires role: ${role}.` });
      if (req.user.accountStatus !== 'ACTIVE') {
        return res.status(403).json({ error: 'Active account status is required.' });
      }
      const membership = db.getActiveAuthorityMembership(req.user.id);
      if (!membership || membership.role !== role) {
        return res.status(403).json({ error: 'An active membership in this authority is required.' });
      }
      req.authorityMembership = membership;
      next();
    };
  }

  function requireAuthorityPermission(permission: AuthorityPermission) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
      if (req.user.role !== 'EXPERT') return res.status(403).json({ error: 'Expert role is required.' });
      if (req.user.accountStatus !== 'ACTIVE') {
        return res.status(403).json({ error: 'Active account status is required.' });
      }
      const membership = db.getActiveAuthorityMembership(req.user.id);
      if (!membership || membership.role !== 'EXPERT') {
        return res.status(403).json({ error: 'An active Expert membership is required.' });
      }
      if (!membership.permissions.includes(permission)) {
        return res.status(403).json({ error: `Missing authority permission: ${permission}.` });
      }
      req.authorityMembership = membership;
      next();
    };
  }

  function withTransaction<T>(callback: () => T): T {
    db.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = callback();
      db.db.exec('COMMIT;');
      return result;
    } catch (error) {
      db.db.exec('ROLLBACK;');
      throw error;
    }
  }

  const MAX_EXPIRY_IN_HOURS = 720;
  function parseExpiry(expiresInHours: unknown): { valid: true; expiresAt: string | null } | { valid: false } {
    if (expiresInHours === undefined || expiresInHours === null) {
      return { valid: true, expiresAt: null };
    }
    if (
      typeof expiresInHours !== 'number' ||
      !Number.isFinite(expiresInHours) ||
      expiresInHours <= 0 ||
      expiresInHours > MAX_EXPIRY_IN_HOURS
    ) {
      return { valid: false };
    }

    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    if (!Number.isFinite(expiresAt.getTime())) return { valid: false };
    return { valid: true, expiresAt: expiresAt.toISOString() };
  }

  function deriveRoadLifecycleState(params: {
    status: RoadStatus;
    expiresAt: string | null;
    activeReports: { verificationStatus: CommunityReport['verificationStatus'] }[];
    activeHazards: { expiresAt: string | null }[];
    fallbackStatus: RoadStatus;
    now: string;
  }): { status: RoadStatus; expiresAt: string | null } {
    const nowMs = Date.parse(params.now);
    const isActiveExpiry = (expiresAt: string | null): boolean =>
      expiresAt === null || (Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > nowMs);
    const currentStatusIsActive = isActiveExpiry(params.expiresAt);

    if (params.status === 'CLOSED' && currentStatusIsActive) {
      return { status: 'CLOSED', expiresAt: params.expiresAt };
    }

    if (params.status === 'VERIFIED_HAZARD' && currentStatusIsActive) {
      if (params.expiresAt === null || params.activeHazards.some(hazard => hazard.expiresAt === null)) {
        return { status: 'VERIFIED_HAZARD', expiresAt: null };
      }
      const activeExpiries = [
        params.expiresAt,
        ...params.activeHazards.map(hazard => hazard.expiresAt)
      ].filter((expiresAt): expiresAt is string => expiresAt !== null);
      const latestExpiry = activeExpiries.reduce((latest, expiresAt) =>
        Date.parse(expiresAt) > Date.parse(latest) ? expiresAt : latest
      );
      return { status: 'VERIFIED_HAZARD', expiresAt: latestExpiry };
    }

    const hasVerifiedReport = params.activeReports.some(report => report.verificationStatus === 'Verified');
    if (hasVerifiedReport || params.activeHazards.length > 0) {
      if (hasVerifiedReport || params.activeHazards.some(hazard => hazard.expiresAt === null)) {
        return { status: 'VERIFIED_HAZARD', expiresAt: null };
      }
      const latestExpiry = params.activeHazards
        .map(hazard => hazard.expiresAt!)
        .reduce((latest, expiresAt) => Date.parse(expiresAt) > Date.parse(latest) ? expiresAt : latest);
      return { status: 'VERIFIED_HAZARD', expiresAt: latestExpiry };
    }

    if (params.activeReports.length > 0) {
      return { status: 'REPORTED_WATERLOGGING', expiresAt: null };
    }

    const fallbackStatus =
      (params.status === 'CLOSED' || params.status === 'VERIFIED_HAZARD') &&
      !currentStatusIsActive
        ? params.fallbackStatus === 'CLOSED' || params.fallbackStatus === 'VERIFIED_HAZARD'
          ? 'OPEN'
          : params.fallbackStatus
        : params.fallbackStatus;
    return {
      status: fallbackStatus,
      expiresAt: fallbackStatus === params.status ? params.expiresAt : null
    };
  }

  // Helper to get authoritative road segments enriched with live rainfall telemetry
  async function getAuthoritativeRoads(forceWeatherRefresh = false): Promise<{
    roads: RoadSegment[];
    rainfall: Awaited<ReturnType<typeof getLiveRainfallFeed>>;
  }> {
    const rainfall = await getLiveRainfallFeed(forceWeatherRefresh);
    const storedRoads = db.getRoadSegments();
    const reports = db.getReports();
    const computed = recomputeRoadRisksFromTelemetry(
      storedRoads,
      PUNE_ROAD_NODES,
      rainfall.observations,
      reports
    );
    const now = new Date().toISOString();
    const activeHazards = db.db.prepare(`
      SELECT road_id, expires_at
      FROM verified_hazards
      WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?)
    `).all(now) as { road_id: string; expires_at: string | null }[];
    const hazardsByRoad = new Map<string, { expiresAt: string | null }[]>();
    for (const hazard of activeHazards) {
      const hazards = hazardsByRoad.get(hazard.road_id) || [];
      hazards.push({ expiresAt: hazard.expires_at });
      hazardsByRoad.set(hazard.road_id, hazards);
    }

    const lifecycleRoads = computed.map(road => {
      const activeReports = reports
        .filter(report =>
          report.roadId === road.id &&
          report.verificationStatus !== 'Rejected' &&
          report.verificationStatus !== 'Resolved'
        )
        .map(report => ({ verificationStatus: report.verificationStatus }));
      const activeRoadHazards = hazardsByRoad.get(road.id) || [];
      const state = deriveRoadLifecycleState({
        status: road.status,
        expiresAt: road.expiresAt ?? null,
        activeReports,
        activeHazards: activeRoadHazards,
        fallbackStatus: road.status,
        now
      });
      if (state.status === road.status && state.expiresAt === (road.expiresAt ?? null)) return road;
      return {
        ...road,
        status: state.status,
        expiresAt: state.expiresAt,
        statusReason: state.status === 'VERIFIED_HAZARD'
          ? 'An active verified hazard remains on this road'
          : state.status === 'REPORTED_WATERLOGGING'
            ? 'An active community report remains on this road'
            : road.statusReason
      };
    });
    db.saveRoadSegments(lifecycleRoads);
    return { roads: lifecycleRoads, rainfall };
  }

  // ----------------- AUTHENTICATION ENDPOINTS -----------------

  app.post('/api/auth/citizen/register', authLimiter, (req: Request, res: Response) => {
    const { fullName, email, password, phone, preferredLanguage } = req.body || {};
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'Full name, email, and password are required.' });
    }
    if (String(fullName).trim().length < 2 || String(fullName).trim().length > 120) {
      return res.status(400).json({ error: 'Full name must be between 2 and 120 characters.' });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    if (String(password).length < 6 || String(password).length > 256) {
      return res.status(400).json({ error: 'Password must be between 6 and 256 characters long.' });
    }
    if (db.getUserByEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    const newUser = {
      id: `USR_CITIZEN_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      fullName: String(fullName).trim(),
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : undefined,
      passwordHash: hashPassword(String(password)),
      role: 'CITIZEN' as const,
      accountStatus: 'ACTIVE' as const,
      createdAt: new Date().toISOString(),
      preferredLanguage: (preferredLanguage || 'en') as 'en' | 'hi' | 'mr'
    };

    db.createUser(newUser);
    const { passwordHash, ...safeUser } = newUser;
    const token = generateToken(safeUser);

    res.status(201).json({
      success: true,
      token,
      user: safeUser,
      message: 'Citizen account created successfully.'
    });
  });

  app.post('/api/auth/citizen/login', authLimiter, (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (String(password).length > 256) {
      return res.status(400).json({ error: 'Password exceeds the maximum length.' });
    }
    const found = db.getUserByEmail(String(email));
    if (!found || !verifyPassword(String(password), found.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (found.role !== 'CITIZEN') {
      return res.status(403).json({ error: 'This account does not have Citizen access.' });
    }
    if (found.accountStatus === 'SUSPENDED') {
      return res.status(403).json({ error: 'Your account has been suspended.' });
    }

    const { passwordHash, ...safeUser } = found;
    const token = generateToken(safeUser);
    res.json({
      success: true,
      token,
      user: safeUser,
      message: 'Citizen login successful.'
    });
  });

  app.post('/api/auth/expert/register', authLimiter, (req: Request, res: Response) => {
    const { fullName, email, password, organisation, designation, phone, authorityId } = req.body || {};
    if (!fullName || !email || !password || !organisation || !designation) {
      return res.status(400).json({
        error: 'Full name, official email, organisation, designation, and password are required.'
      });
    }
    if (String(fullName).trim().length < 2 || String(fullName).trim().length > 120) {
      return res.status(400).json({ error: 'Full name must be between 2 and 120 characters.' });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please provide a valid official email address.' });
    }
    if (String(password).length < 6 || String(password).length > 256) {
      return res.status(400).json({ error: 'Password must be between 6 and 256 characters long.' });
    }
    if (db.getUserByEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    let applicationAuthorityId: string | null = null;
    if (authorityId) {
      const authority = db.db.prepare(
        "SELECT id FROM authorities WHERE id = ? AND status = 'ACTIVE'"
      ).get(String(authorityId)) as { id: string } | undefined;
      if (!authority) return res.status(400).json({ error: 'Select an active authority.' });
      applicationAuthorityId = authority.id;
    } else {
      const activeAuthorities = db.db.prepare(
        "SELECT id FROM authorities WHERE status = 'ACTIVE'"
      ).all() as { id: string }[];
      if (activeAuthorities.length === 1) {
        applicationAuthorityId = activeAuthorities[0].id;
      } else if (activeAuthorities.length > 1) {
        return res.status(400).json({ error: 'Select the authority reviewing your application.' });
      }
    }

    const now = new Date().toISOString();
    const newExpert = {
      id: `USR_EXPERT_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      fullName: String(fullName).trim(),
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : undefined,
      passwordHash: hashPassword(String(password)),
      role: 'EXPERT' as const,
      accountStatus: 'PENDING_APPROVAL' as const,
      organisation: String(organisation).trim(),
      designation: String(designation).trim(),
      createdAt: now
    };
    const application: ExpertApplication = {
      id: `APP_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId: newExpert.id,
      fullName: newExpert.fullName,
      email: newExpert.email,
      organisation: newExpert.organisation!,
      designation: newExpert.designation!,
      status: 'PENDING_APPROVAL',
      appliedAt: now,
      authorityId: applicationAuthorityId || undefined
    };
    withTransaction(() => {
      db.createUser(newExpert);
      db.createExpertApplication(application);
    });

    const { passwordHash, ...safeUser } = newExpert;
    res.status(201).json({
      success: true,
      user: safeUser,
      application,
      message: 'Expert registration submitted. An Authority Admin must approve it before operational access is enabled.'
    });
  });

  app.post('/api/auth/expert/login', authLimiter, (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (String(password).length > 256) {
      return res.status(400).json({ error: 'Password exceeds the maximum length.' });
    }
    const found = db.getUserByEmail(String(email));
    if (!found || !verifyPassword(String(password), found.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (found.role !== 'EXPERT') {
      return res.status(403).json({
        error: 'This account does not have Expert clearance. Please log in via Citizen Portal.'
      });
    }
    if (found.accountStatus === 'PENDING_APPROVAL') {
      return res.status(403).json({
        error: 'Your expert application is awaiting verification. Access to operational controls is restricted until approval.',
        accountStatus: 'PENDING_APPROVAL'
      });
    }
    if (found.accountStatus === 'REJECTED') {
      return res.status(403).json({
        error: 'Your expert application was reviewed and rejected.',
        accountStatus: 'REJECTED'
      });
    }
    if (found.accountStatus === 'SUSPENDED') {
      return res.status(403).json({
        error: 'Your expert account has been suspended.',
        accountStatus: 'SUSPENDED'
      });
    }

    const { passwordHash, ...safeUser } = found;
    const token = generateToken(safeUser);
    const authorityMembership = db.getActiveAuthorityMembership(found.id) || undefined;
    res.json({
      success: true,
      token,
      user: { ...safeUser, authorityMembership },
      message: 'Expert authority login verified.'
    });
  });

  app.post('/api/auth/authority-admin/login', authLimiter, (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      email.trim().length > 254 ||
      !password ||
      password.length > 256
    ) {
      return res.status(400).json({ error: 'Official email and password are required.' });
    }
    const found = db.getUserByEmail(email);
    if (!found || found.role !== 'AUTHORITY_ADMIN' || !verifyPassword(password, found.passwordHash)) {
      return res.status(401).json({ error: 'Invalid official email or password.' });
    }
    if (found.accountStatus !== 'ACTIVE') {
      return res.status(403).json({ error: 'This Authority Admin account is not active.' });
    }
    const authorityMembership = db.getActiveAuthorityMembership(found.id);
    if (!authorityMembership || authorityMembership.role !== 'AUTHORITY_ADMIN') {
      return res.status(403).json({ error: 'No active Authority Admin membership is assigned to this account.' });
    }
    const { passwordHash, ...safeUser } = found;
    res.json({
      success: true,
      token: generateToken(safeUser),
      user: { ...safeUser, authorityMembership },
      message: 'Authority Admin sign-in successful.'
    });
  });

  app.get('/api/authorities', (_req: Request, res: Response) => {
    const authorities = db.db.prepare(
      "SELECT id, name, authority_type AS authorityType, region FROM authorities WHERE status = 'ACTIVE' ORDER BY name"
    ).all();
    res.json(authorities);
  });

  // Development-only demo login endpoint (no client-side hardcoded passwords; disabled in production)
  app.post('/api/auth/dev-login', authLimiter, (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production' || process.env.SEED_DEMO_ACCOUNTS === 'false') {
      return res.status(404).json({ error: 'Endpoint disabled in production.' });
    }
    const { account } = req.body || {};
    const emailMap: Record<string, string> = {
      citizen: 'citizen@pune.in',
      expert: 'officer.kulkarni@pmc.gov.in',
      pending_expert: 'deshmukh@ndrf.gov.in'
    };
    const email = emailMap[String(account)];
    if (!email) {
      return res.status(400).json({ error: 'Unknown dev account selector.' });
    }
    const found = db.getUserByEmail(email);
    if (!found) {
      return res.status(404).json({ error: 'Seeded demo user not found.' });
    }
    if (found.accountStatus === 'PENDING_APPROVAL') {
      return res.status(403).json({
        error: 'This seeded expert account is awaiting approval (demonstrates approval guard).',
        accountStatus: 'PENDING_APPROVAL'
      });
    }
    const { passwordHash, ...safeUser } = found;
    const authorityMembership = found.role === 'EXPERT'
      ? db.getActiveAuthorityMembership(found.id) || undefined
      : undefined;
    const token = generateToken(safeUser);
    res.json({ success: true, token, user: { ...safeUser, authorityMembership } });
  });

  app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    const authorityMembership = req.user?.role === 'CITIZEN'
      ? undefined
      : db.getActiveAuthorityMembership(req.user!.id) || undefined;
    res.json({
      success: true,
      user: { ...req.user, authorityMembership }
    });
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.json({ success: true, message: 'Logged out successfully.' });
  });

  app.post('/api/auth/forgot-password', authLimiter, (req: Request, res: Response) => {
    const email = req.body?.email ? String(req.body.email).trim() : '';
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    res.json({
      success: true,
      message: `If an account exists for ${email}, recovery instructions are handled by the disaster cell coordinator (no automated SMTP server configured in this local deployment).`
    });
  });

  // ----------------- AUTHORITY ADMINISTRATION -----------------

  const requireAuthorityAdmin = requireAuthorityRole('AUTHORITY_ADMIN');

  app.get('/api/authority/dashboard', authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) => {
    const authorityId = req.authorityMembership!.authorityId;
    const authority = db.db.prepare(`
      SELECT id, name, authority_type AS authorityType, region, status
      FROM authorities WHERE id = ?
    `).get(authorityId);
    const totals = db.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM authority_memberships WHERE authority_id = ? AND membership_role = 'EXPERT') AS totalExperts,
        (SELECT COUNT(*) FROM authority_memberships WHERE authority_id = ? AND membership_role = 'EXPERT' AND status = 'ACTIVE') AS activeExperts,
        (SELECT COUNT(*) FROM authority_memberships WHERE authority_id = ? AND status = 'SUSPENDED') AS suspendedMembers,
        (SELECT COUNT(*) FROM expert_applications WHERE authority_id = ? AND status = 'PENDING_APPROVAL') AS pendingApplications,
        (SELECT COUNT(*) FROM authority_invitations WHERE authority_id = ? AND status = 'PENDING' AND expires_at > ?) AS pendingInvitations
    `).get(authorityId, authorityId, authorityId, authorityId, authorityId, new Date().toISOString());
    res.json({ authority, ...totals });
  });

  app.get('/api/authority/profile', authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) => {
    const authority = db.db.prepare(`
      SELECT id, name, authority_type AS authorityType, region, status, created_at AS createdAt
      FROM authorities WHERE id = ?
    `).get(req.authorityMembership!.authorityId);
    if (!authority) return res.status(404).json({ error: 'Authority not found.' });
    res.json({ authority });
  });

  app.get('/api/authority/members', authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) => {
    const authorityId = req.authorityMembership!.authorityId;
    const members = db.db.prepare(`
      SELECT m.id AS membershipId, m.authority_id AS authorityId, m.user_id AS userId,
             m.membership_role AS role, m.status, m.created_at AS createdAt,
             u.full_name AS fullName, u.email, u.organisation, u.designation, u.account_status AS accountStatus
      FROM authority_memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.authority_id = ?
      ORDER BY m.membership_role, u.full_name
    `).all(authorityId) as Record<string, unknown>[];
    res.json(members.map(member => ({
      ...member,
      permissions: (db.db.prepare(
        'SELECT permission FROM authority_permissions WHERE membership_id = ? ORDER BY permission'
      ).all(String(member.membershipId)) as { permission: string }[]).map(item => item.permission)
    })));
  });

  app.post('/api/authority/invitations', invitationLimiter, authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const intendedRole = req.body?.intendedRole;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'A valid official email address is required.' });
    }
    if (intendedRole !== 'EXPERT' && intendedRole !== 'AUTHORITY_ADMIN') {
      return res.status(400).json({ error: 'Invitation role must be EXPERT or AUTHORITY_ADMIN.' });
    }
    const authorityId = req.authorityMembership!.authorityId;
    if (db.getUserByEmail(email)) {
      return res.status(409).json({ error: 'An account already uses this email address.' });
    }

    const now = new Date().toISOString();
    const invitationId = `INV_${crypto.randomUUID()}`;
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      withTransaction(() => {
        db.db.prepare(`
          UPDATE authority_invitations SET status = 'EXPIRED'
          WHERE authority_id = ? AND status = 'PENDING' AND expires_at <= ?
        `).run(authorityId, now);
        db.db.prepare(`
          INSERT INTO authority_invitations
            (id, authority_id, email, intended_role, token_hash, expires_at, status, invited_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `).run(invitationId, authorityId, email, intendedRole, tokenHash, expiresAt, req.user!.id, now);
        db.appendAuthorityAuditLog(req.user!, authorityId, 'INVITATION_CREATED', invitationId,
          `Invited ${email} as ${intendedRole}.`);
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'A pending invitation already exists for this email.' });
      }
      throw error;
    }
    res.status(201).json({
      success: true,
      invitation: { id: invitationId, email, intendedRole, expiresAt },
      invitationToken: rawToken
    });
  });

  app.get('/api/authority/invitations', authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) => {
    const authorityId = req.authorityMembership!.authorityId;
    const now = new Date().toISOString();
    db.db.prepare(`
      UPDATE authority_invitations SET status = 'EXPIRED'
      WHERE authority_id = ? AND status = 'PENDING' AND expires_at <= ?
    `).run(authorityId, now);
    const invitations = db.db.prepare(`
      SELECT id, email, intended_role AS intendedRole, expires_at AS expiresAt,
             status, invited_by AS invitedBy, created_at AS createdAt
      FROM authority_invitations WHERE authority_id = ? AND status = 'PENDING'
      ORDER BY created_at DESC
    `).all(authorityId);
    res.json(invitations);
  });

  app.delete('/api/authority/invitations/:id', invitationLimiter, authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) => {
    const authorityId = req.authorityMembership!.authorityId;
    const revoked = withTransaction(() => {
      const result = db.db.prepare(`
        UPDATE authority_invitations SET status = 'REVOKED'
        WHERE id = ? AND authority_id = ? AND status = 'PENDING'
      `).run(req.params.id, authorityId);
      if (!result.changes) return false;
      db.appendAuthorityAuditLog(req.user!, authorityId, 'INVITATION_REVOKED', req.params.id, 'Revoked pending invitation.');
      return true;
    });
    if (!revoked) return res.status(404).json({ error: 'Pending invitation not found.' });
    res.json({ success: true });
  });

  app.post('/api/authority/invitations/accept', invitationLimiter, (req: Request, res: Response) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
    if (!token || token.length > 256 || password.length < 10 || password.length > 256) {
      return res.status(400).json({ error: 'A valid invitation token and password of at least 10 characters are required.' });
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();
    const invitation = db.db.prepare(`
      SELECT i.*, a.status AS authority_status
      FROM authority_invitations i JOIN authorities a ON a.id = i.authority_id
      WHERE i.token_hash = ?
    `).get(tokenHash) as Record<string, unknown> | undefined;
    if (!invitation || invitation.status !== 'PENDING') {
      return res.status(410).json({ error: 'Invitation is invalid, revoked, or already used.' });
    }
    if (String(invitation.expires_at) <= now) {
      db.db.prepare("UPDATE authority_invitations SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'")
        .run(String(invitation.id));
      return res.status(410).json({ error: 'Invitation has expired.' });
    }
    if (invitation.authority_status !== 'ACTIVE') {
      return res.status(403).json({ error: 'This authority is not accepting invitations.' });
    }

    const existing = db.getUserByEmail(String(invitation.email));
    const invitedRole = String(invitation.intended_role) as 'AUTHORITY_ADMIN' | 'EXPERT';
    if (existing && (existing.role !== invitedRole || !verifyPassword(password, existing.passwordHash))) {
      return res.status(409).json({ error: 'This email is already registered. Use its matching account password to accept.' });
    }
    if (!existing && (fullName.length < 2 || fullName.length > 120)) {
      return res.status(400).json({ error: 'Full name is required and must be at most 120 characters.' });
    }
    if (existing && existing.accountStatus === 'SUSPENDED') {
      return res.status(403).json({ error: 'Suspended accounts cannot accept invitations.' });
    }

    const userId = existing?.id || `USR_${crypto.randomUUID()}`;
    const membershipId = `MEM_${crypto.randomUUID()}`;
    let safeUser: User;
    try {
      safeUser = withTransaction(() => {
        const fresh = db.db.prepare(`
          SELECT i.*, a.status AS authority_status
          FROM authority_invitations i JOIN authorities a ON a.id = i.authority_id
          WHERE i.id = ? AND i.token_hash = ? AND i.status = 'PENDING' AND i.expires_at > ?
        `).get(String(invitation.id), tokenHash, now) as Record<string, unknown> | undefined;
        if (!fresh || fresh.authority_status !== 'ACTIVE') {
          throw new Error('INVITATION_NO_LONGER_VALID');
        }
        if (existing) {
          const membership = db.db.prepare(
            'SELECT id FROM authority_memberships WHERE user_id = ?'
          ).get(existing.id);
          if (membership) throw new Error('MEMBERSHIP_ALREADY_EXISTS');
          db.db.prepare('UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?')
            .run('ACTIVE', now, existing.id);
        } else {
          db.createUser({
            id: userId,
            fullName,
            email: String(fresh.email),
            passwordHash: hashPassword(password),
            role: invitedRole,
            accountStatus: 'ACTIVE',
            createdAt: now
          });
        }
        db.db.prepare(`
          INSERT INTO authority_memberships
            (id, authority_id, user_id, membership_role, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
        `).run(membershipId, String(fresh.authority_id), userId, invitedRole, String(fresh.invited_by), now, now);
        db.db.prepare(`
          UPDATE authority_invitations SET status = 'ACCEPTED', accepted_at = ?
          WHERE id = ? AND status = 'PENDING'
        `).run(now, String(fresh.id));
        const acceptedUser = db.getUserById(userId);
        if (!acceptedUser) throw new Error('ACCEPTED_USER_NOT_FOUND');
        db.appendAuthorityAuditLog(acceptedUser, String(fresh.authority_id), 'INVITATION_ACCEPTED',
          String(fresh.id), `Invitation accepted for ${acceptedUser.email}.`);
        const { passwordHash: _passwordHash, ...withoutHash } = acceptedUser;
        return withoutHash;
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVITATION_NO_LONGER_VALID') {
        return res.status(410).json({ error: 'Invitation is expired or has already been accepted.' });
      }
      if (error instanceof Error && error.message === 'MEMBERSHIP_ALREADY_EXISTS') {
        return res.status(409).json({ error: 'This account already has an authority membership.' });
      }
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'This account already has an active authority membership.' });
      }
      throw error;
    }
    const authorityMembership = db.getActiveAuthorityMembership(userId) || undefined;
    res.status(201).json({
      success: true,
      token: generateToken(safeUser),
      user: { ...safeUser, authorityMembership }
    });
  });

  app.get('/api/authority/applications', authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) => {
    const rows = db.db.prepare(`
      SELECT application_id AS id, user_id AS userId, full_name AS fullName, email,
             organisation, designation, status, applied_at AS appliedAt,
             reviewed_at AS reviewedAt, reviewed_by AS reviewedBy, authority_id AS authorityId
      FROM expert_applications WHERE authority_id = ? ORDER BY applied_at DESC
    `).all(req.authorityMembership!.authorityId);
    res.json(rows);
  });

  function reviewApplication(req: AuthenticatedRequest, res: Response, status: 'ACTIVE' | 'REJECTED') {
    const authorityId = req.authorityMembership!.authorityId;
    const now = new Date().toISOString();
    let application: Record<string, unknown>;
    try {
      application = withTransaction(() => {
        const pending = db.db.prepare(`
          SELECT * FROM expert_applications
          WHERE application_id = ? AND authority_id = ? AND status = 'PENDING_APPROVAL'
        `).get(req.params.id, authorityId) as Record<string, unknown> | undefined;
        if (!pending) throw new Error('APPLICATION_NO_LONGER_PENDING');
        const userId = String(pending.user_id);
        if (status === 'ACTIVE') {
          const existingMembership = db.db.prepare(
            'SELECT id FROM authority_memberships WHERE user_id = ?'
          ).get(userId);
          if (existingMembership) throw new Error('MEMBERSHIP_ALREADY_EXISTS');
          db.db.prepare(`
            INSERT INTO authority_memberships
              (id, authority_id, user_id, membership_role, status, created_by, created_at, updated_at)
            VALUES (?, ?, ?, 'EXPERT', 'ACTIVE', ?, ?, ?)
          `).run(`MEM_${crypto.randomUUID()}`, authorityId, userId, req.user!.id, now, now);
        }
        db.db.prepare(`
          UPDATE expert_applications SET status = ?, reviewed_at = ?, reviewed_by = ?
          WHERE application_id = ? AND authority_id = ? AND status = 'PENDING_APPROVAL'
        `).run(status, now, req.user!.fullName, req.params.id, authorityId);
        db.db.prepare('UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?')
          .run(status, now, userId);
        db.appendAuthorityAuditLog(req.user!, authorityId,
          status === 'ACTIVE' ? 'EXPERT_APPLICATION_APPROVED' : 'EXPERT_APPLICATION_REJECTED',
          userId, `${status === 'ACTIVE' ? 'Approved' : 'Rejected'} application for ${String(pending.full_name)}.`);
        return pending;
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'APPLICATION_NO_LONGER_PENDING') {
        return res.status(404).json({ error: 'Pending application not found in this authority.' });
      }
      if (error instanceof Error && error.message === 'MEMBERSHIP_ALREADY_EXISTS') {
        return res.status(409).json({ error: 'Applicant already has an authority membership.' });
      }
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Applicant already belongs to an active authority.' });
      }
      throw error;
    }
    const userId = String(application.user_id);
    if (status === 'ACTIVE') {
      db.createNotification({
        userId,
        title: 'Expert Account Approved',
        message: `Your expert application was approved by ${req.user!.fullName}.`,
        severity: 'info'
      });
    }
    return res.json({
      success: true,
      application: { ...application, status, reviewedAt: now, reviewedBy: req.user!.fullName }
    });
  }

  app.patch('/api/authority/applications/:id/approve', authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) =>
    reviewApplication(req, res, 'ACTIVE'));

  app.patch('/api/authority/applications/:id/reject', authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) =>
    reviewApplication(req, res, 'REJECTED'));

  app.patch('/api/authority/members/:membershipId/status', authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) => {
    const authorityId = req.authorityMembership!.authorityId;
    const nextStatus = req.body?.status;
    if (nextStatus !== 'ACTIVE' && nextStatus !== 'SUSPENDED') {
      return res.status(400).json({ error: 'Membership status must be ACTIVE or SUSPENDED.' });
    }
    const target = db.db.prepare(`
      SELECT m.id, m.user_id, m.membership_role, m.status, u.email
      FROM authority_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.id = ? AND m.authority_id = ?
    `).get(req.params.membershipId, authorityId) as Record<string, unknown> | undefined;
    if (!target) return res.status(404).json({ error: 'Authority member not found.' });
    const now = new Date().toISOString();
    try {
      withTransaction(() => {
        if (
          nextStatus === 'SUSPENDED' &&
          target.membership_role === 'AUTHORITY_ADMIN' &&
          target.status === 'ACTIVE'
        ) {
          const activeAdmins = db.db.prepare(`
            SELECT COUNT(*) AS count FROM authority_memberships
            WHERE authority_id = ? AND membership_role = 'AUTHORITY_ADMIN' AND status = 'ACTIVE'
          `).get(authorityId) as { count: number };
          if (Number(activeAdmins.count) <= 1) {
            throw new Error('LAST_ACTIVE_AUTHORITY_ADMIN');
          }
        }
        db.db.prepare('UPDATE authority_memberships SET status = ?, updated_at = ? WHERE id = ?')
          .run(nextStatus, now, req.params.membershipId);
        db.db.prepare('UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?')
          .run(nextStatus === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED', now, String(target.user_id));
        db.appendAuthorityAuditLog(req.user!, authorityId,
          nextStatus === 'ACTIVE' ? 'MEMBERSHIP_REACTIVATED' : 'MEMBERSHIP_SUSPENDED',
          String(target.user_id), `${nextStatus === 'ACTIVE' ? 'Reactivated' : 'Suspended'} ${String(target.email)}.`);
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'LAST_ACTIVE_AUTHORITY_ADMIN') {
        return res.status(409).json({ error: 'The last active Authority Admin cannot be suspended.' });
      }
      throw error;
    }
    res.json({ success: true, membershipId: req.params.membershipId, status: nextStatus });
  });

  app.post('/api/authority/members/:membershipId/permissions', authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) => {
    const permission = req.body?.permission;
    if (!AUTHORITY_PERMISSIONS.includes(permission)) {
      return res.status(400).json({ error: 'Unknown authority permission.' });
    }
    const authorityId = req.authorityMembership!.authorityId;
    const target = db.db.prepare(`
      SELECT m.id, m.user_id, m.membership_role, u.email FROM authority_memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.id = ? AND m.authority_id = ? AND m.membership_role = 'EXPERT'
    `).get(req.params.membershipId, authorityId) as Record<string, unknown> | undefined;
    if (!target) return res.status(404).json({ error: 'Expert membership not found in this authority.' });
    const now = new Date().toISOString();
    withTransaction(() => {
      db.db.prepare(`
        INSERT INTO authority_permissions (id, membership_id, permission, assigned_by, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (membership_id, permission) DO NOTHING
      `).run(`PERM_${crypto.randomUUID()}`, String(target.id), permission, req.user!.id, now);
      db.appendAuthorityAuditLog(req.user!, authorityId, 'EXPERT_PERMISSION_ASSIGNED',
        String(target.user_id), `Assigned ${String(permission)} to ${String(target.email)}.`);
    });
    res.json({ success: true, permission });
  });

  app.delete('/api/authority/members/:membershipId/permissions/:permission', authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) => {
    const permission = req.params.permission as AuthorityPermission;
    if (!AUTHORITY_PERMISSIONS.includes(permission)) return res.status(400).json({ error: 'Unknown authority permission.' });
    const authorityId = req.authorityMembership!.authorityId;
    const target = db.db.prepare(`
      SELECT m.id, m.user_id, u.email FROM authority_memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.id = ? AND m.authority_id = ? AND m.membership_role = 'EXPERT'
    `).get(req.params.membershipId, authorityId) as Record<string, unknown> | undefined;
    if (!target) return res.status(404).json({ error: 'Expert membership not found in this authority.' });
    withTransaction(() => {
      const result = db.db.prepare(
        'DELETE FROM authority_permissions WHERE membership_id = ? AND permission = ?'
      ).run(String(target.id), permission);
      if (result.changes) {
        db.appendAuthorityAuditLog(req.user!, authorityId, 'EXPERT_PERMISSION_REVOKED',
          String(target.user_id), `Revoked ${permission} from ${String(target.email)}.`);
      }
    });
    res.json({ success: true, permission });
  });

  app.get('/api/authority/audit-logs', authenticateToken, requireAuthorityAdmin, (req: AuthenticatedRequest, res: Response) => {
    const rows = db.db.prepare(`
      SELECT log_id AS id, actor_id AS actorId, actor_name AS actorName,
             actor_role AS actorRole, authority_id AS authorityId, action,
             target_resource AS targetResource, details, timestamp
      FROM audit_logs WHERE authority_id = ? ORDER BY timestamp DESC LIMIT 200
    `).all(req.authorityMembership!.authorityId);
    res.json({ auditLogs: rows });
  });

  app.get('/api/expert/audit-logs', authenticateToken, requireAuthorityPermission('AUDIT_VIEW'), (req: AuthenticatedRequest, res: Response) => {
    const rows = db.db.prepare(`
      SELECT log_id AS id, actor_id AS actorId, actor_name AS actorName,
             actor_role AS actorRole, authority_id AS authorityId, action,
             target_resource AS targetResource, details, timestamp
      FROM audit_logs WHERE authority_id = ? ORDER BY timestamp DESC LIMIT 150
    `).all(req.authorityMembership!.authorityId);
    res.json({ auditLogs: rows });
  });

  // ----------------- OPERATIONAL & GEOSPATIAL ENDPOINTS -----------------

  app.get('/api/health', async (_req: Request, res: Response) => {
    const rainfall = await getLiveRainfallFeed(false);
    res.json({
      status: 'ok',
      service: 'SanketSetu Intelligence Platform',
      region: 'Pune & Pimpri-Chinchwad, Maharashtra, India',
      database: 'sqlite_persistent',
      rolesSupported: ['CITIZEN', 'AUTHORITY_ADMIN', 'EXPERT'],
      weatherFeed: {
        openMeteoStatus: rainfall.openMeteoStatus,
        imdApiStatus: rainfall.imdApiStatus,
        lastSuccessfulUpdate: rainfall.lastSuccessfulUpdate
      },
      geminiConfigured: Boolean(aiClient),
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/rainfall', async (req: Request, res: Response) => {
    const force = req.query.refresh === 'true';
    const feed = await getLiveRainfallFeed(force);
    res.json(feed);
  });

  app.get('/api/roads', async (req: Request, res: Response) => {
    const force = req.query.refresh === 'true';
    const { roads, rainfall } = await getAuthoritativeRoads(force);
    res.json({
      nodes: PUNE_ROAD_NODES,
      segments: roads,
      rainfall,
      lastUpdated: new Date().toISOString()
    });
  });

  app.patch('/api/roads/:id/status', writeLimiter, authenticateToken, requireAuthorityPermission('ROAD_STATUS_UPDATE'), (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const roadScope = db.db.prepare(
      'SELECT authority_id FROM road_segments WHERE road_id = ?'
    ).get(id) as { authority_id: string | null } | undefined;
    if (!roadScope || roadScope.authority_id !== req.authorityMembership!.authorityId) {
      return res.status(404).json({ error: 'Road segment not found in this authority.' });
    }
    const { status, riskScore, reason, expiresInHours } = req.body || {};
    const validStatuses: RoadStatus[] = ['OPEN', 'REPORTED_WATERLOGGING', 'VERIFIED_HAZARD', 'CLOSED', 'UNKNOWN'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid road status. Must be one of: ${validStatuses.join(', ')}` });
    }
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) {
      return res.status(400).json({ error: 'A concise operational reason is required when updating road status.' });
    }
    const expiry = parseExpiry(expiresInHours);
    if (!expiry.valid) {
      return res.status(400).json({
        error: `expiresInHours must be a finite number greater than 0 and no more than ${MAX_EXPIRY_IN_HOURS}, or null/omitted for a non-expiring status.`
      });
    }

    let nextRisk: number | null = typeof riskScore === 'number' ? Math.max(0, Math.min(100, riskScore)) : null;
    if (nextRisk === null) {
      if (status === 'CLOSED') nextRisk = 100;
      else if (status === 'VERIFIED_HAZARD') nextRisk = 80;
      else if (status === 'OPEN') nextRisk = 20;
    }

    const expiresAt = expiry.expiresAt;

    const riskCat = classifyRiskScore(nextRisk).category;
    const updatedRoad = db.updateRoadStatus({
      roadId: id,
      status,
      riskScore: nextRisk,
      riskCategory: riskCat,
      reason: cleanReason,
      expiresAt,
      actor: req.user!
    });

    if (!updatedRoad) {
      return res.status(404).json({ error: 'Road segment not found.' });
    }

    db.appendAuditLog(
      req.user!,
      'ROAD_STATUS_CHANGE',
      `${updatedRoad.id} (${updatedRoad.name})`,
      `Status set to ${status} (Risk: ${nextRisk ?? 'Unknown'}). Reason: ${cleanReason}${expiresAt ? ` | Expires: ${expiresAt}` : ''}`,
      req.authorityMembership!.authorityId
    );

    if (status === 'CLOSED' || status === 'VERIFIED_HAZARD' || status === 'OPEN') {
      db.createNotification({
        title:
          status === 'CLOSED'
            ? `Road Officially Closed: ${updatedRoad.name}`
            : status === 'VERIFIED_HAZARD'
            ? `Verified Flood Hazard: ${updatedRoad.name}`
            : `Road Reopened: ${updatedRoad.name}`,
        message: `${cleanReason}${expiresAt ? ` (Advisory active until ${new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}`,
        severity: status === 'CLOSED' ? 'critical' : status === 'VERIFIED_HAZARD' ? 'warning' : 'info',
        relatedRoadId: updatedRoad.id
      });
    }

    res.json({ success: true, updatedRoad });
  });

  app.post('/api/routes/snap', async (req: Request, res: Response) => {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!isValidPuneCoordinate(lat, lng)) {
      return res.status(400).json({
        error: 'Coordinates must lie within the Pune & Pimpri-Chinchwad service boundary.'
      });
    }
    const { roads } = await getAuthoritativeRoads(false);
    const snapped = snapCoordinateToRoadNetwork(lat, lng, PUNE_ROAD_NODES, roads);
    res.json({ success: true, ...snapped });
  });

  app.get('/api/geocode', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ results: [] });
    }

    const lower = q.toLowerCase();
    const localMatches = Object.values(PUNE_ROAD_NODES)
      .filter(n => n.name.toLowerCase().includes(lower) || (n.sector || '').toLowerCase().includes(lower))
      .slice(0, 6)
      .map(n => ({
        label: n.name,
        sector: n.sector || 'Pune / PCMC',
        lat: n.lat,
        lng: n.lng,
        nodeId: n.id,
        source: 'SanketSetu Road Graph'
      }));

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&viewbox=73.65,18.72,74.02,18.40&bounded=1&q=${encodeURIComponent(q + ', Pune')}`;
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'SanketSetu-Pune-FloodRisk/1.0' }
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const nom = (await resp.json()) as { display_name: string; lat: string; lon: string }[];
        const roads = db.getRoadSegments();
        const remoteMatches = nom
          .filter(item => isValidPuneCoordinate(Number(item.lat), Number(item.lon)))
          .map(item => {
            const lat = Number(item.lat);
            const lng = Number(item.lon);
            const snapped = snapCoordinateToRoadNetwork(lat, lng, PUNE_ROAD_NODES, roads);
            return {
              label: item.display_name.split(',').slice(0, 3).join(','),
              sector: snapped.nearestNode.name,
              lat,
              lng,
              nodeId: snapped.nearestNode.id,
              source: 'OpenStreetMap Nominatim'
            };
          });
        const merged = [...localMatches];
        for (const r of remoteMatches) {
          if (!merged.some(m => m.nodeId === r.nodeId && m.label === r.label)) {
            merged.push(r);
          }
        }
        return res.json({ results: merged.slice(0, 8) });
      }
    } catch {
      // Fall back cleanly to local Pune intersection matches
    }

    res.json({ results: localMatches });
  });

  app.post('/api/routes/find', async (req: Request, res: Response) => {
    const {
      startNodeId,
      targetNodeId,
      originLat,
      originLng,
      destLat,
      destLng,
      lambdaRisk = 1.5,
      vehicleType = 'car'
    } = req.body || {};

    const { roads } = await getAuthoritativeRoads(false);

    let effectiveStartId = startNodeId;
    let effectiveTargetId = targetNodeId;
    let snappedOrigin = null;
    let snappedDest = null;

    if (!effectiveStartId && originLat !== undefined && originLng !== undefined) {
      const lat = Number(originLat);
      const lng = Number(originLng);
      if (!isValidPuneCoordinate(lat, lng)) {
        return res.status(400).json({ error: 'Origin coordinates outside Pune/PCMC coverage.' });
      }
      snappedOrigin = snapCoordinateToRoadNetwork(lat, lng, PUNE_ROAD_NODES, roads);
      effectiveStartId = snappedOrigin.nearestNode.id;
    }

    if (!effectiveTargetId && destLat !== undefined && destLng !== undefined) {
      const lat = Number(destLat);
      const lng = Number(destLng);
      if (!isValidPuneCoordinate(lat, lng)) {
        return res.status(400).json({ error: 'Destination coordinates outside Pune/PCMC coverage.' });
      }
      snappedDest = snapCoordinateToRoadNetwork(lat, lng, PUNE_ROAD_NODES, roads);
      effectiveTargetId = snappedDest.nearestNode.id;
    }

    if (!effectiveStartId || !effectiveTargetId || !PUNE_ROAD_NODES[effectiveStartId] || !PUNE_ROAD_NODES[effectiveTargetId]) {
      return res.status(400).json({ error: 'Valid origin and destination nodes or Pune coordinates are required.' });
    }

    const validVehicleTypes = ['car', 'two_wheeler', 'heavy', 'emergency'] as const;
    const effectiveVehicleType: 'car' | 'two_wheeler' | 'heavy' | 'emergency' =
      validVehicleTypes.includes(vehicleType) ? vehicleType : 'car';

    const rawLambda = Number(lambdaRisk);
    const parsedLambda = Number.isFinite(rawLambda) ? Math.max(0, Math.min(5.0, rawLambda)) : 1.5;
    const graphEdges: GraphEdge[] = roads.map(r => ({
      id: r.id,
      from: r.from,
      to: r.to,
      name: r.name,
      distanceKm: r.distanceKm,
      speedKmph: r.speedKmph,
      riskScore: r.riskScore,
      status: r.status,
      baseElevationM: r.baseElevationM,
      isOneWay: r.isOneWay,
      accessRestriction: r.accessRestriction,
      coordinates: r.coordinates
    }));

    const shortest = calculateDijkstraRoute(
      PUNE_ROAD_NODES,
      graphEdges,
      effectiveStartId,
      effectiveTargetId,
      'shortest',
      parsedLambda,
      new Set(),
      new Set(),
      effectiveVehicleType
    );

    const fastest = calculateDijkstraRoute(
      PUNE_ROAD_NODES,
      graphEdges,
      effectiveStartId,
      effectiveTargetId,
      'fastest',
      parsedLambda,
      new Set(),
      new Set(),
      effectiveVehicleType
    );

    const safestAlternatives = calculateKShortestPaths(
      PUNE_ROAD_NODES,
      graphEdges,
      effectiveStartId,
      effectiveTargetId,
      'safest',
      parsedLambda,
      3,
      effectiveVehicleType
    );

    const safest =
      safestAlternatives[0] ||
      calculateDijkstraRoute(
        PUNE_ROAD_NODES,
        graphEdges,
        effectiveStartId,
        effectiveTargetId,
        'safest',
        parsedLambda,
        new Set(),
        new Set(),
        effectiveVehicleType
      );

    res.json({
      originNode: PUNE_ROAD_NODES[effectiveStartId],
      targetNode: PUNE_ROAD_NODES[effectiveTargetId],
      snappedOrigin,
      snappedDest,
      lambdaRisk: parsedLambda,
      shortest,
      fastest,
      safest,
      alternatives: safestAlternatives
    });
  });

  app.post('/api/risk/calculate', (req: Request, res: Response) => {
    const {
      rainfallMm,
      durationHrs,
      rainfallTimestamp,
      elevationM,
      slopePct,
      drainageCondition,
      hasHistoricalFlood,
      communityRiskScore,
      weights
    } = req.body || {};

    const result = calculateFloodRisk({
      rainfallMm: rainfallMm === null || rainfallMm === undefined ? null : Number(rainfallMm),
      durationHrs: durationHrs === null || durationHrs === undefined ? 24 : Number(durationHrs),
      rainfallTimestamp: rainfallTimestamp ?? new Date().toISOString(),
      elevationM: elevationM === null || elevationM === undefined ? null : Number(elevationM),
      slopePct: slopePct === null || slopePct === undefined ? null : Number(slopePct),
      drainageCondition: drainageCondition ?? 'unknown',
      hasHistoricalFlood: hasHistoricalFlood === null || hasHistoricalFlood === undefined ? null : Boolean(hasHistoricalFlood),
      communityRiskScore: communityRiskScore === null || communityRiskScore === undefined ? null : Number(communityRiskScore),
      weights
    });
    res.json(result);
  });

  app.get('/api/waterways', (_req: Request, res: Response) => {
    res.json(INITIAL_WATERWAYS);
  });

  app.get('/api/historical-floods', (_req: Request, res: Response) => {
    res.json(INITIAL_HISTORICAL_FLOODS);
  });

  app.get('/api/shelters', (_req: Request, res: Response) => {
    res.json(db.getShelters());
  });

  app.patch('/api/shelters/:id', writeLimiter, authenticateToken, requireAuthorityPermission('SHELTER_MANAGE'), (req: AuthenticatedRequest, res: Response) => {
    const shelterScope = db.db.prepare(
      'SELECT authority_id FROM shelters WHERE shelter_id = ?'
    ).get(req.params.id) as { authority_id: string | null } | undefined;
    if (!shelterScope || shelterScope.authority_id !== req.authorityMembership!.authorityId) {
      return res.status(404).json({ error: 'Shelter not found in this authority.' });
    }
    const { currentOccupancy, capacity } = req.body || {};
    const updatedShelter = db.updateShelter(
      req.params.id,
      typeof currentOccupancy === 'number' ? currentOccupancy : undefined,
      typeof capacity === 'number' ? capacity : undefined
    );
    if (!updatedShelter) return res.status(404).json({ error: 'Shelter not found.' });
    db.appendAuditLog(
      req.user!,
      'SHELTER_UPDATE',
      `${updatedShelter.id} (${updatedShelter.name})`,
      `Occupancy updated to ${updatedShelter.currentOccupancy}/${updatedShelter.capacity}`,
      req.authorityMembership!.authorityId
    );
    res.json({ success: true, updatedShelter });
  });

  app.get('/api/hospitals', (_req: Request, res: Response) => {
    res.json(INITIAL_HOSPITALS);
  });

  app.get('/api/emergency-facilities', (_req: Request, res: Response) => {
    res.json(INITIAL_EMERGENCY_FACILITIES);
  });

  // ----------------- REPORTS & EXPERT VERIFICATION -----------------

  app.get('/api/reports', (_req: Request, res: Response) => {
    res.json(db.getReports());
  });

  app.get('/api/reports/my-reports', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    const all = db.getReports();
    res.json(all.filter(r => r.userId === req.user!.id));
  });

  app.post('/api/reports', writeLimiter, authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { locationName, lat, lng, reportType, description, severity, roadId, imageUrl } = req.body || {};
    if (!locationName || !reportType || !severity) {
      return res.status(400).json({ error: 'Location name, report type, and severity are required.' });
    }

    const photoCheck = validateOptionalDataImage(imageUrl);
    if (!photoCheck.ok) {
      return res.status(400).json({ error: photoCheck.error });
    }

    const parsedLat = Number(lat ?? 18.5204);
    const parsedLng = Number(lng ?? 73.8567);
    if (!isValidPuneCoordinate(parsedLat, parsedLng)) {
      return res.status(400).json({ error: 'Report coordinates must lie within Pune & Pimpri-Chinchwad.' });
    }

    const currentRoads = db.getRoadSegments();
    let targetRoadId = roadId ? String(roadId) : undefined;
    if (!targetRoadId) {
      const snapped = snapCoordinateToRoadNetwork(parsedLat, parsedLng, PUNE_ROAD_NODES, currentRoads);
      targetRoadId = snapped.nearestRoad?.id;
    }

    const newReport: CommunityReport = {
      id: `REP_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId: req.user!.id,
      userName: req.user!.fullName,
      roadId: targetRoadId,
      locationName: String(locationName).trim(),
      lat: parsedLat,
      lng: parsedLng,
      reportType,
      description: String(description || 'Citizen reported water hazard').trim(),
      severity,
      imageUrl: photoCheck.value,
      timestamp: new Date().toISOString(),
      verificationStatus: 'Reported',
      confidenceScore: photoCheck.value ? 0.78 : 0.65
    };

    db.createReport(newReport);

    // IMPORTANT REQUIREMENT: Citizen reports NEVER auto-close a road.
    // They flag it as REPORTED_WATERLOGGING so routing warns users while awaiting expert verification.
    if (targetRoadId) {
      const targetRoad = currentRoads.find(r => r.id === targetRoadId);
      if (targetRoad && targetRoad.status === 'OPEN') {
        db.updateRoadStatus({
          roadId: targetRoad.id,
          status: 'REPORTED_WATERLOGGING',
          riskScore: targetRoad.riskScore,
          riskCategory: targetRoad.riskCategory,
          reason: `Unverified citizen report (${newReport.reportType} - ${newReport.severity}) awaiting expert verification`,
          actor: req.user!
        });
      }
    }

    const { roads } = await getAuthoritativeRoads(false);
    res.status(201).json({ success: true, report: newReport, roads });
  });

  app.patch('/api/reports/:id/verify', writeLimiter, authenticateToken, requireAuthorityPermission('REPORTS_VERIFY'), async (req: AuthenticatedRequest, res: Response) => {
    const reportScope = db.db.prepare(`
      SELECT r.road_id, road.authority_id
      FROM community_reports r
      LEFT JOIN road_segments road ON road.road_id = r.road_id
      WHERE r.report_id = ?
    `).get(req.params.id) as { road_id: string | null; authority_id: string | null } | undefined;
    if (!reportScope || reportScope.authority_id !== req.authorityMembership!.authorityId) {
      return res.status(404).json({ error: 'Report not found in this authority.' });
    }
    const { verificationStatus, officialAction, reviewNotes, expiresInHours } = req.body || {};
    const validStates: CommunityReport['verificationStatus'][] = ['Reported', 'Under Review', 'Verified', 'Rejected', 'Resolved'];
    if (!validStates.includes(verificationStatus)) {
      return res.status(400).json({ error: 'Invalid verification status.' });
    }
    if (officialAction && !req.authorityMembership!.permissions.includes('HAZARD_VERIFY')) {
      return res.status(403).json({ error: 'Missing authority permission: HAZARD_VERIFY.' });
    }
    const expiry = parseExpiry(expiresInHours);
    if (!expiry.valid) {
      return res.status(400).json({
        error: `expiresInHours must be a finite number greater than 0 and no more than ${MAX_EXPIRY_IN_HOURS}, or null/omitted for a non-expiring status.`
      });
    }

    const confidence =
      verificationStatus === 'Verified' ? 0.95 :
      verificationStatus === 'Rejected' ? 0.20 :
      verificationStatus === 'Resolved' ? 0.90 : 0.72;

    let updated: CommunityReport | null;
    try {
      updated = withTransaction(() => {
        const currentReport = db.db.prepare(`
          SELECT r.verification_status, r.road_id, road.authority_id
          FROM community_reports r
          LEFT JOIN road_segments road ON road.road_id = r.road_id
          WHERE r.report_id = ?
        `).get(req.params.id) as {
          verification_status: CommunityReport['verificationStatus'];
          road_id: string | null;
          authority_id: string | null;
        } | undefined;
        if (!currentReport || currentReport.authority_id !== req.authorityMembership!.authorityId) {
          return null;
        }

        const previousStatus = currentReport.verification_status;
        const verifiedReport = db.updateReportVerification({
          reportId: req.params.id,
          verificationStatus,
          confidenceScore: confidence,
          reviewedBy: req.user!.fullName,
          reviewNotes: reviewNotes ? String(reviewNotes) : undefined,
          resolvedAt: verificationStatus === 'Resolved' ? new Date().toISOString() : undefined
        });
        if (!verifiedReport) return null;

        if (verificationStatus === 'Verified' && verifiedReport.roadId) {
          db.createVerifiedHazard({
            reportId: verifiedReport.id,
            roadId: verifiedReport.roadId,
            hazardType: verifiedReport.reportType,
            severity: verifiedReport.severity,
            description: verifiedReport.description,
            actor: req.user!,
            expiresAt: expiry.expiresAt
          });

          const shouldClose = officialAction === 'close_road';
          db.updateRoadStatus({
            roadId: verifiedReport.roadId,
            status: shouldClose ? 'CLOSED' : 'VERIFIED_HAZARD',
            riskScore: shouldClose ? 100 : 85,
            riskCategory: 'Severe',
            reason: reviewNotes ? String(reviewNotes) : `Expert-verified ${verifiedReport.reportType} near ${verifiedReport.locationName}`,
            expiresAt: expiry.expiresAt,
            actor: req.user!
          });
        } else if (verificationStatus === 'Resolved' && verifiedReport.roadId) {
          db.db.prepare(`
            UPDATE verified_hazards
            SET is_active = 0
            WHERE report_id = ? AND is_active = 1
          `).run(verifiedReport.id);

          const road = db.db.prepare(`
            SELECT status, expires_at, risk_score
            FROM road_segments
            WHERE road_id = ? AND authority_id = ?
          `).get(verifiedReport.roadId, req.authorityMembership!.authorityId) as {
            status: RoadStatus;
            expires_at: string | null;
            risk_score: number | null;
          } | undefined;

          if (road) {
            const now = new Date().toISOString();
            const activeReports = db.db.prepare(`
              SELECT verification_status AS verificationStatus
              FROM community_reports
              WHERE road_id = ? AND verification_status NOT IN ('Rejected', 'Resolved')
            `).all(verifiedReport.roadId) as {
              verificationStatus: CommunityReport['verificationStatus'];
            }[];
            const activeHazards = db.db.prepare(`
              SELECT expires_at AS expiresAt
              FROM verified_hazards
              WHERE road_id = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > ?)
            `).all(verifiedReport.roadId, now) as { expiresAt: string | null }[];
            const state = deriveRoadLifecycleState({
              status: road.status,
              expiresAt: road.expires_at,
              activeReports,
              activeHazards,
              fallbackStatus: 'OPEN',
              now
            });

            if (state.status !== road.status || state.expiresAt !== road.expires_at) {
              const riskScore =
                state.status === 'CLOSED' ? 100 :
                state.status === 'VERIFIED_HAZARD' ? 85 :
                state.status === 'REPORTED_WATERLOGGING' ? road.risk_score ?? 60 : 25;
              db.updateRoadStatus({
                roadId: verifiedReport.roadId,
                status: state.status,
                riskScore,
                riskCategory: classifyRiskScore(riskScore).category,
                reason: reviewNotes
                  ? String(reviewNotes)
                  : `Incident ${verifiedReport.id} resolved; road status reflects remaining reports and hazards`,
                expiresAt: state.expiresAt,
                actor: req.user!
              });
            }
          }
        }

        db.appendAuditLog(
          req.user!,
          'INCIDENT_VERIFICATION',
          verifiedReport.id,
          `Report status changed to ${verificationStatus} for ${verifiedReport.locationName}${officialAction ? ` (action: ${officialAction})` : ''}`,
          req.authorityMembership!.authorityId
        );

        if (previousStatus !== verificationStatus) {
          db.createNotification({
            userId: verifiedReport.userId,
            title: `Report ${verificationStatus}: ${verifiedReport.locationName}`,
            message: `${req.user!.fullName} updated your ${verifiedReport.reportType} report to ${verificationStatus}.${reviewNotes ? ` Note: ${reviewNotes}` : ''}`,
            severity: verificationStatus === 'Verified' ? 'warning' : 'info',
            relatedRoadId: verifiedReport.roadId,
            relatedReportId: verifiedReport.id
          });
        }

        return verifiedReport;
      });
    } catch (error) {
      console.error('[SankatSetu] Report verification transaction failed:', error);
      return res.status(500).json({ error: 'Unable to update report verification.' });
    }

    if (!updated) return res.status(404).json({ error: 'Report not found in this authority.' });

    const { roads } = await getAuthoritativeRoads(false);
    res.json({ success: true, report: updated, roads });
  });

  // ----------------- POLLS, FEEDBACK, NOTIFICATIONS -----------------

  app.get('/api/polls', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json(db.getPolls(req.user?.id));
  });

  app.post('/api/polls/:id/vote', writeLimiter, authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    const option = String(req.body?.option || '');
    const result = db.castPollVote(req.params.id, req.user!.id, option);
    if (!result.ok || !result.poll) {
      const code = result.error?.includes('already voted') ? 409 : 400;
      return res.status(code).json({ error: result.error || 'Failed to vote.' });
    }
    res.json({
      success: true,
      poll: result.poll,
      breakdown: calculatePollBreakdown(result.poll.votes)
    });
  });

  app.get('/api/routes/feedback', (_req: Request, res: Response) => {
    res.json(db.getRouteFeedback());
  });

  app.post('/api/routes/feedback', writeLimiter, authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    const { routeName, reachedSafely, routeCondition, waterLevelCategory, travelTimeMins, rating } = req.body || {};
    const numRating = Math.max(1, Math.min(5, Number(rating) || 5));
    const fb: RouteFeedback = {
      id: `FB_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId: req.user!.id,
      userName: req.user!.fullName,
      routeName: String(routeName || 'Pune Safe Route').trim(),
      reachedSafely: Boolean(reachedSafely),
      routeCondition: String(routeCondition || 'Normal').trim(),
      waterLevelCategory: String(waterLevelCategory || 'None').trim(),
      travelTimeMins: Math.max(1, Number(travelTimeMins) || 15),
      rating: numRating,
      timestamp: new Date().toISOString()
    };
    db.createRouteFeedback(fb);
    res.status(201).json({ success: true, feedback: fb });
  });

  app.get('/api/notifications', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json(db.getNotificationsForUser(req.user?.id));
  });

  app.patch('/api/notifications/:id/read', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    db.markNotificationRead(req.params.id);
    res.json({ success: true });
  });

  // ----------------- GEMINI AI ASSISTANT WITH LIVE BACKEND TOOLS -----------------

  app.post('/api/chatbot/message', writeLimiter, async (req: Request, res: Response) => {
    const { message, lang = 'en' } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }
    const userMessage = String(message).trim();
    const { roads, rainfall } = await getAuthoritativeRoads(false);
    const shelters = db.getShelters();
    const reports = db.getReports();

    // Live backend tool handlers (single source of truth)
    const executeTool = (name: string, args: Record<string, any> = {}) => {
      if (name === 'getLiveRainfallSummary') {
        return {
          openMeteoStatus: rainfall.openMeteoStatus,
          imdApiStatus: rainfall.imdApiStatus,
          imdNote: rainfall.imdNote,
          lastUpdated: rainfall.lastSuccessfulUpdate,
          stations: rainfall.observations.map(o => ({
            stationName: o.stationName,
            observedPast24hMm: o.observedPast24hMm,
            currentHourMm: o.currentHourMm,
            forecastNext24hMm: o.forecastNext24hMm,
            dataType: o.dataType,
            available: o.isAvailable
          }))
        };
      }
      if (name === 'getRoadNetworkStatus') {
        const query = String(args.roadQuery || '').toLowerCase();
        const filtered = query
          ? roads.filter(r => r.name.toLowerCase().includes(query) || r.id.toLowerCase() === query)
          : roads.filter(r => r.status !== 'OPEN' || (r.riskScore ?? 0) >= 40).slice(0, 12);
        return {
          totalRoads: roads.length,
          closedRoads: roads.filter(r => r.status === 'CLOSED').map(r => r.name),
          verifiedHazards: roads.filter(r => r.status === 'VERIFIED_HAZARD').map(r => r.name),
          reportedWaterlogging: roads.filter(r => r.status === 'REPORTED_WATERLOGGING').map(r => r.name),
          matchingCorridors: filtered.map(r => ({
            id: r.id,
            name: r.name,
            status: r.status,
            riskScore: r.riskScore,
            riskCategory: r.riskCategory,
            distanceKm: r.distanceKm,
            elevationM: r.baseElevationM,
            statusReason: r.statusReason
          })),
          recentReports: reports.slice(0, 5).map(rep => ({
            locationName: rep.locationName,
            type: rep.reportType,
            severity: rep.severity,
            status: rep.verificationStatus
          }))
        };
      }
      if (name === 'findSafeRouteBetweenNodes') {
        const qOrigin = String(args.originQuery || '').toLowerCase();
        const qDest = String(args.destinationQuery || '').toLowerCase();
        const nodesList = Object.values(PUNE_ROAD_NODES);
        const oNode = nodesList.find(n => n.name.toLowerCase().includes(qOrigin) || n.id.toLowerCase() === qOrigin);
        const dNode = nodesList.find(n => n.name.toLowerCase().includes(qDest) || n.id.toLowerCase() === qDest);
        if (!oNode || !dNode) {
          return {
            error: 'Could not match origin or destination to Pune/PCMC road nodes.',
            availableNodes: nodesList.slice(0, 15).map(n => n.name)
          };
        }
        const graphEdges: GraphEdge[] = roads.map(r => ({
          id: r.id,
          from: r.from,
          to: r.to,
          name: r.name,
          distanceKm: r.distanceKm,
          speedKmph: r.speedKmph,
          riskScore: r.riskScore,
          status: r.status,
          baseElevationM: r.baseElevationM,
          isOneWay: r.isOneWay,
          accessRestriction: r.accessRestriction
        }));
        const safest = calculateDijkstraRoute(PUNE_ROAD_NODES, graphEdges, oNode.id, dNode.id, 'safest', 1.8);
        const fastest = calculateDijkstraRoute(PUNE_ROAD_NODES, graphEdges, oNode.id, dNode.id, 'fastest', 1.8);
        const shortest = calculateDijkstraRoute(PUNE_ROAD_NODES, graphEdges, oNode.id, dNode.id, 'shortest', 1.8);
        return {
          origin: oNode.name,
          destination: dNode.name,
          safest: {
            feasible: safest.feasible,
            distanceKm: safest.totalDistanceKm,
            travelTimeMins: safest.travelTimeMins,
            avgRisk: safest.averageRiskScore,
            maxRisk: safest.maxRiskScore,
            hazardousSegments: safest.hazardousSegmentCount,
            closuresAvoided: safest.closuresAvoidedCount,
            safetyRating: safest.safetyRating,
            corridors: safest.edges.map(e => e.name),
            warnings: safest.unverifiedWarnings
          },
          fastest: {
            feasible: fastest.feasible,
            distanceKm: fastest.totalDistanceKm,
            travelTimeMins: fastest.travelTimeMins,
            avgRisk: fastest.averageRiskScore,
            maxRisk: fastest.maxRiskScore,
            corridors: fastest.edges.map(e => e.name)
          },
          shortest: {
            feasible: shortest.feasible,
            distanceKm: shortest.totalDistanceKm,
            travelTimeMins: shortest.travelTimeMins,
            avgRisk: shortest.averageRiskScore,
            maxRisk: shortest.maxRiskScore,
            corridors: shortest.edges.map(e => e.name)
          }
        };
      }
      if (name === 'getEmergencyResources') {
        return {
          shelters: shelters.map(s => ({
            name: s.name,
            address: s.address,
            availableCapacity: s.capacity - s.currentOccupancy,
            petFriendly: s.petFriendly,
            wheelchairAccessible: s.wheelchairAccessible,
            contact: s.contact
          })),
          hospitals: INITIAL_HOSPITALS.map(h => ({
            name: h.name,
            contact: h.contact,
            availableIcu: h.availableIcu
          })),
          rescueAndHelplines: INITIAL_EMERGENCY_FACILITIES
        };
      }
      return { error: 'Unknown tool' };
    };

    if (aiClient) {
      try {
        const declarations: FunctionDeclaration[] = [
          {
            name: 'getLiveRainfallSummary',
            description: 'Fetch live Open-Meteo rainfall observations and IMD API availability across Pune and PCMC stations.',
            parameters: { type: Type.OBJECT, properties: {} }
          },
          {
            name: 'getRoadNetworkStatus',
            description: 'Fetch authoritative road statuses, risk scores, official closures, and citizen reports in Pune/PCMC.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                roadQuery: { type: Type.STRING, description: 'Optional road or neighborhood name to filter, e.g. Sinhagad, FC Road, Wakad' }
              }
            }
          },
          {
            name: 'findSafeRouteBetweenNodes',
            description: 'Compute authoritative safest and fastest road routes between two Pune/PCMC locations using Dijkstra routing.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                originQuery: { type: Type.STRING, description: 'Origin area name e.g. Shivajinagar' },
                destinationQuery: { type: Type.STRING, description: 'Destination area name e.g. Kothrud' }
              },
              required: ['originQuery', 'destinationQuery']
            }
          },
          {
            name: 'getEmergencyResources',
            description: 'List verified Pune & PCMC flood shelters, hospitals, animal rescue (RESQ), fire brigade, and disaster control helplines.',
            parameters: { type: Type.OBJECT, properties: {} }
          }
        ];

        const langLabel = lang === 'hi' ? 'Hindi' : lang === 'mr' ? 'Marathi' : 'English';
        const systemInstruction =
          `You are SanketSetu AI, the emergency flood intelligence assistant for Pune & Pimpri-Chinchwad, Maharashtra.
STRICT GROUNDING RULES:
1. Always invoke the provided backend tools to read live rainfall, road risk/closures, routes, or shelters before answering factual questions.
2. NEVER invent rainfall numbers, road closures, dam discharge values, or route times. If data is unavailable (e.g. IMD API key missing), state that explicitly.
3. Never claim any flooded corridor is 100% safe. Distinguish unverified citizen reports from expert-verified hazards/closures.
4. Reply clearly and concisely in ${langLabel}.`;

        const userContents = [{ role: 'user', parts: [{ text: userMessage }] }];
        const resp1 = await aiClient.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: userContents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: declarations }]
          }
        });

        const calls = resp1.functionCalls;
        if (calls && calls.length > 0 && resp1.candidates?.[0]?.content) {
          const functionResponses = calls.map(call => ({
            functionResponse: {
              id: call.id,
              name: call.name!,
              response: executeTool(call.name!, (call.args || {}) as Record<string, any>)
            }
          }));

          const resp2 = await aiClient.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: [
              ...userContents,
              resp1.candidates[0].content,
              { role: 'user', parts: functionResponses }
            ],
            config: {
              systemInstruction,
              tools: [{ functionDeclarations: declarations }]
            }
          });

          if (resp2.text) {
            return res.json({
              reply: resp2.text,
              source: 'Gemini AI (gemini-4-hydrogen) grounded in Live SanketSetu Backend Tools',
              timestamp: new Date().toISOString()
            });
          }
        } else if (resp1.text) {
          return res.json({
            reply: resp1.text,
            source: 'Gemini AI (gemini-4-hydrogen) grounded in SanketSetu Context',
            timestamp: new Date().toISOString()
          });
        }
      } catch (llmErr) {
        console.warn('[SanketSetu] Gemini assistant call failed, returning honest live-telemetry summary:', llmErr);
      }
    }

    // Honest deterministic live-data summary when GEMINI_API_KEY is not configured or unavailable
    const closed = roads.filter(r => r.status === 'CLOSED');
    const hazards = roads.filter(r => r.status === 'VERIFIED_HAZARD');
    const reported = roads.filter(r => r.status === 'REPORTED_WATERLOGGING');
    const maxRain = rainfall.observations.reduce((m, o) => Math.max(m, o.observedPast24hMm ?? 0), 0);

    const summary =
      lang === 'mr'
        ? `संकेतसेतू थेट स्थिती (LLM की उपलब्ध नाही): पुणे २४ तास पर्जन्यमान ${rainfall.openMeteoStatus === 'OK' ? `${maxRain} मि.मी.` : 'उपलब्ध नाही'}. अधिकृत बंद रस्ते: ${closed.length}, तज्ञ-पडताळलेले धोके: ${hazards.length}, नागरिक अहवाल: ${reported.length}. आपत्कालीन मदत: PMC +91-20-25501269 | अग्निशमन 101 | रुग्णवाहिका 108 | RESQ प्राणी मदत +91-9890999111.`
        : lang === 'hi'
        ? `संकेतसेतु लाइव स्थिति (AI सेवा अनउपलब्ध): पुणे 24 घंटे वर्षा ${rainfall.openMeteoStatus === 'OK' ? `${maxRain} मिमी` : 'अनुपलब्ध'}। आधिकारिक बंद सड़कें: ${closed.length}, सत्यापित खतरे: ${hazards.length}, नागरिक रिपोर्ट: ${reported.length}। आपातकालीन हेल्पलाइन: PMC +91-20-25501269 | दमकल 101 | एम्बुलेंस 108 | RESQ पशु बचाव +91-9890999111।`
        : `SanketSetu Live Telemetry Summary (AI LLM unavailable — showing verified backend data): ` +
          `Pune max 24h Open-Meteo rainfall: ${rainfall.openMeteoStatus === 'OK' ? `${maxRain} mm` : 'Unavailable'}. ` +
          `Official closures: ${closed.length > 0 ? closed.map(r => r.name).join(', ') : 'None'}. ` +
          `Verified hazards: ${hazards.length > 0 ? hazards.map(r => r.name).join(', ') : 'None'}. ` +
          `Unverified citizen waterlogging reports: ${reported.length}. ` +
          `24x7 Helplines: PMC Disaster +91-20-25501269, Fire 101, Ambulance 108, NDRF 1070, RESQ Animal Rescue +91-9890999111.`;

    res.json({
      reply: summary,
      source: aiClient ? 'Live Backend Telemetry (Gemini fallback)' : 'Live Backend Telemetry (GEMINI_API_KEY not configured)',
      timestamp: new Date().toISOString()
    });
  });

  return { app, db };
}

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const { app } = createSanketSetuApp();
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(resolve('dist')));
    app.get('*', (_req, res) => {
      res.sendFile(resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SanketSetu Secure Server running on http://0.0.0.0:${PORT}`);
  });
}

const isEntrypoint = Boolean(process.argv[1] && process.argv[1].endsWith('server.ts'));
if (isEntrypoint && process.env.SANKETSETU_NO_LISTEN !== '1') {
  startServer();
}
