import express, { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { Content, FunctionDeclaration, GenerateContentConfig, GoogleGenAI, Modality, Type } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  INITIAL_HOSPITALS,
  INITIAL_EMERGENCY_FACILITIES,
  INITIAL_HISTORICAL_FLOODS,
  INITIAL_WATERWAYS
} from './src/data/puneData';
import { SanketSetuDatabase } from './src/db/database';
import { getLiveRainfallFeed, recomputeRoadRisksFromTelemetry } from './src/services/weatherService';
import { getSegmentTrafficSpeed, getTrafficFeedStatus } from './src/services/trafficService';
import {
  classifyGeminiError,
  getGeminiConfiguration,
  isRetryableGeminiError,
  requiresBackendGrounding,
  SUPPORTED_LIVE_MODELS,
  SUPPORTED_TEXT_MODELS,
  withGeminiRetry
} from './src/services/geminiConfig';
import {
  startScheduledOsmSync,
  executeOsmSynchronization,
  registerGraphUpdateListener,
  stopScheduledOsmSync
} from './src/services/osmSyncService';
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
  RoadNode,
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
const MAX_TOMTOM_SEGMENTS_PER_ROUTE = 12;
const SANKETSETU_AI_SAFETY_INSTRUCTIONS =
  'Never invent current weather, rainfall, flood levels, road closures, shelter or hospital availability, emergency contacts, route metrics, or dispatch status. Current local facts must come from SanketSetu backend tools. Distinguish expert-verified hazards from unverified community reports. Never guarantee a route is safe. Never claim an SOS or call was completed. Do not perform consequential actions; this assistant only reads backend data.';

function getSanketSetuAiSystemInstruction(lang: string): string {
  const langLabel = lang === 'hi' ? 'Hindi' : lang === 'mr' ? 'Marathi' : 'English';
  return `You are SanketSetu AI, the emergency flood information assistant for Pune and Pimpri-Chinchwad, Maharashtra. ${SANKETSETU_AI_SAFETY_INSTRUCTIONS}
Use the read-only backend tools for weather, hazards, roads, routes, shelters, hospitals, reports, alerts, and data sources before answering questions about those facts. Cite the source and update time when the tool provides them. Mark unknown or unavailable values honestly. Treat prior messages as context, not as verified current data. Reply concisely in ${langLabel}.`;
}

const LIVE_BACKEND_TOOL: FunctionDeclaration = {
  name: 'querySanketSetuBackend',
  description: 'Read verified SanketSetu backend data for a Pune/PCMC flood-safety question. This tool is read-only and cannot dispatch SOS, submit a report, or place a call.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The current/local information requested by the user.' }
    },
    required: ['query']
  }
};

const LIVE_AI_SYSTEM_INSTRUCTION =
  `You are SanketSetu Live, a real-time voice interface for Pune and Pimpri-Chinchwad. ${SANKETSETU_AI_SAFETY_INSTRUCTIONS}
For any current/local flood-safety fact, call querySanketSetuBackend first. Speak only what its result supports; preserve the result's unavailable state, source, timestamp, and distinction between verified and unverified reports. If the tool says AI is unavailable, state that clearly and read only its verified backend fallback. For general conversation, avoid claims about current local conditions. Never claim to submit reports, call emergency services, or dispatch SOS.`;

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

  // Maintain active road network nodes dynamically in memory
  let activeNodes: Record<string, RoadNode> = db.getRoadNodes();

  // Refresh and validate the bundled OSM-derived graph on the scheduled interval.
  startScheduledOsmSync(db, (updatedNodes) => {
    activeNodes = updatedNodes;
  });

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
  const geminiConfiguration = getGeminiConfiguration();
  const geminiApiKey = geminiConfiguration.apiKey;
  let aiClient: GoogleGenAI | null = null;
  if (geminiApiKey) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          apiVersion: 'v1beta',
          timeout: geminiConfiguration.timeoutMs,
          retryOptions: { attempts: 1 }
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

  function requireCitizenOrActiveExpert() {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (req.user?.role === 'CITIZEN') return next();
      if (req.user?.role === 'EXPERT') return requireAuthorityRole('EXPERT')(req, res, next);
      return res.status(403).json({ error: 'Citizen or active Expert access is required.' });
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
      activeNodes,
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
    db.createExpertRegistration(newExpert, application);

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
        accountStatus: 'PENDING_APPROVAL',
        applicationId: db.getExpertApplicationForUser(found.id)?.id
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
             reviewed_at AS reviewedAt, reviewed_by AS reviewedBy,
             reviewed_by_id AS reviewedById, authority_id AS authorityId
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
          UPDATE expert_applications SET status = ?, reviewed_at = ?, reviewed_by = ?, reviewed_by_id = ?
          WHERE application_id = ? AND authority_id = ? AND status = 'PENDING_APPROVAL'
        `).run(status, now, req.user!.fullName, req.user!.id, req.params.id, authorityId);
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
    const reviewedApplication = db.getExpertApplicationById(String(application.application_id));
    if (!reviewedApplication) throw new Error('Reviewed expert application could not be reloaded.');
    return res.json({
      success: true,
      application: reviewedApplication
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

  app.get('/api/health', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
    const rainfall = await getLiveRainfallFeed(false);
    const isActiveExpert =
      req.user?.role === 'EXPERT' &&
      req.user.accountStatus === 'ACTIVE' &&
      Boolean(db.getActiveAuthorityMembership(req.user.id));
    res.json({
      status: 'ok',
      region: 'Pune & Pimpri-Chinchwad, Maharashtra, India',
      rolesSupported: ['CITIZEN', 'AUTHORITY_ADMIN', 'EXPERT'],
      weatherFeed: {
        openMeteoStatus: rainfall.openMeteoStatus,
        lastSuccessfulUpdate: rainfall.lastSuccessfulUpdate,
        ...(isActiveExpert ? { imdApiStatus: rainfall.imdApiStatus } : {})
      },
      timestamp: new Date().toISOString(),
      ...(isActiveExpert
        ? {
            service: 'SanketSetu Intelligence Platform',
            database: 'sqlite_persistent',
            geminiConfigured: Boolean(aiClient)
          }
        : {})
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
      nodes: activeNodes,
      segments: roads,
      rainfall,
      lastUpdated: new Date().toISOString()
    });
  });

  app.get('/api/roads/status', (_req: Request, res: Response) => {
    const roads = db.getRoadSegments();
    const reports = db.getReports();
    const activeReportedRoadIds = new Set(
      reports.flatMap(report =>
        report.roadId &&
        report.verificationStatus !== 'Rejected' &&
        report.verificationStatus !== 'Resolved'
          ? [report.roadId]
          : []
      )
    );
    const now = Date.now();
    res.json({
      roads: roads.map(road => {
        const expired = Boolean(road.expiresAt && Date.parse(road.expiresAt) <= now);
        const hasActiveReport = activeReportedRoadIds.has(road.id);
        return {
          id: road.id,
          status: expired ? (hasActiveReport ? 'REPORTED_WATERLOGGING' : 'OPEN') : road.status,
          riskScore: road.riskScore,
          expiresAt: road.expiresAt
        };
      })
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

    const currentRoad = db.getRoadSegments().find(road => road.id === id);
    if (!currentRoad) {
      return res.status(404).json({ error: 'Road segment not found.' });
    }
    const nextRisk: number | null =
      typeof riskScore === 'number'
        ? Math.max(0, Math.min(100, riskScore))
        : currentRoad.riskScore;

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

    if (!updatedRoad) return res.status(404).json({ error: 'Road segment not found.' });

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

  app.get('/api/traffic/status', authenticateToken, requireAuthorityRole('EXPERT'), (_req: AuthenticatedRequest, res: Response) => {
    res.json(getTrafficFeedStatus());
  });

  app.get('/api/network/status', authenticateToken, requireAuthorityRole('EXPERT'), (_req: AuthenticatedRequest, res: Response) => {
    const latestSync = db.getLatestOsmSync();
    res.json({
      provider: 'OpenStreetMap ODbL-derived bundled road snapshot',
      syncMode: 'LOCAL_CANONICAL_SNAPSHOT_REFRESH',
      externalFetchEnabled: false,
      statusMessage: 'The scheduled task refreshes and validates the bundled road graph; it does not fetch current data from Overpass.',
      syncIntervalHours: parseFloat(process.env.OSM_SYNC_INTERVAL_HOURS || '24'),
      syncEnabled: process.env.OSM_SYNC_ENABLED !== 'false',
      nodesCount: Object.keys(activeNodes).length,
      edgesCount: db.getRoadSegments().length,
      lastSync: latestSync,
      lastValidation: latestSync,
      recentLogs: db.getOsmSyncLogs(5),
      timestamp: new Date().toISOString()
    });
  });

  app.post('/api/expert/network/sync', writeLimiter, authenticateToken, requireAuthorityRole('EXPERT'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await executeOsmSynchronization(db, 'MANUAL', req.user);
      if (!result.success) {
        return res.status(400).json({ error: result.message, details: result.error });
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to refresh the bundled OSM-derived road graph: ' + (err.message || String(err)) });
    }
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
    const snapped = snapCoordinateToRoadNetwork(lat, lng, activeNodes, roads);
    res.json({ success: true, ...snapped });
  });

  app.get('/api/geocode', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ results: [] });
    }

    const lower = q.toLowerCase();
    const localMatches = Object.values(activeNodes)
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
            const snapped = snapCoordinateToRoadNetwork(lat, lng, activeNodes, roads);
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

    const { roads, rainfall } = await getAuthoritativeRoads(false);

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
      snappedOrigin = snapCoordinateToRoadNetwork(lat, lng, activeNodes, roads);
      effectiveStartId = snappedOrigin.nearestNode.id;
    }

    if (!effectiveTargetId && destLat !== undefined && destLng !== undefined) {
      const lat = Number(destLat);
      const lng = Number(destLng);
      if (!isValidPuneCoordinate(lat, lng)) {
        return res.status(400).json({ error: 'Destination coordinates outside Pune/PCMC coverage.' });
      }
      snappedDest = snapCoordinateToRoadNetwork(lat, lng, activeNodes, roads);
      effectiveTargetId = snappedDest.nearestNode.id;
    }

    if (!effectiveStartId || !effectiveTargetId || !activeNodes[effectiveStartId] || !activeNodes[effectiveTargetId]) {
      return res.status(400).json({ error: 'Valid origin and destination nodes or Pune coordinates are required.' });
    }

    const validVehicleTypes = ['car', 'two_wheeler', 'heavy', 'emergency'] as const;
    const effectiveVehicleType: 'car' | 'two_wheeler' | 'heavy' | 'emergency' =
      validVehicleTypes.includes(vehicleType) ? vehicleType : 'car';

    const rawLambda = Number(lambdaRisk);
    const parsedLambda = Number.isFinite(rawLambda) ? Math.max(0, Math.min(5.0, rawLambda)) : 1.5;

    const baseGraphEdges: GraphEdge[] = roads.map(road => ({
      id: road.id,
      from: road.from,
      to: road.to,
      name: road.name,
      distanceKm: road.distanceKm,
      speedKmph: road.speedKmph,
      riskScore: road.riskScore,
      status: road.status,
      riskCategory: road.riskCategory,
      riskSources: road.riskSources,
      riskExplanation: road.riskExplanation,
      riskObservationTimestamp: road.riskObservationTimestamp,
      riskUpdatedAt: road.riskUpdatedAt,
      lastUpdated: road.lastUpdated,
      verifiedBy: road.verifiedBy,
      statusReason: road.statusReason,
      expiresAt: road.expiresAt,
      baseElevationM: road.baseElevationM,
      slopePct: road.slopePct,
      drainageCondition: road.drainageCondition,
      confidenceScore: road.confidenceScore,
      isOneWay: road.isOneWay,
      accessRestriction: road.accessRestriction,
      coordinates: road.coordinates
    }));

    const initialShortest = calculateDijkstraRoute(
      activeNodes,
      baseGraphEdges,
      effectiveStartId,
      effectiveTargetId,
      'shortest',
      parsedLambda,
      new Set(),
      new Set(),
      effectiveVehicleType
    );
    const initialFastest = calculateDijkstraRoute(
      activeNodes,
      baseGraphEdges,
      effectiveStartId,
      effectiveTargetId,
      'fastest',
      parsedLambda,
      new Set(),
      new Set(),
      effectiveVehicleType
    );
    const initialSafestAlternatives = calculateKShortestPaths(
      activeNodes,
      baseGraphEdges,
      effectiveStartId,
      effectiveTargetId,
      'safest',
      parsedLambda,
      3,
      effectiveVehicleType
    );
    const candidateRoutes = [
      initialFastest,
      initialShortest,
      ...initialSafestAlternatives
    ];
    const candidateRoadIds = new Set<string>();
    for (let routePosition = 0; candidateRoadIds.size < MAX_TOMTOM_SEGMENTS_PER_ROUTE; routePosition++) {
      let foundCandidate = false;
      for (const candidateRoute of candidateRoutes) {
        const edge = candidateRoute.edges[routePosition];
        if (!edge) continue;
        foundCandidate = true;
        candidateRoadIds.add(edge.id);
        if (candidateRoadIds.size >= MAX_TOMTOM_SEGMENTS_PER_ROUTE) break;
      }
      if (!foundCandidate) break;
    }

    // Sample only roads on the estimated candidate routes, never the entire network.
    const roadsById = new Map(roads.map(road => [road.id, road]));
    const candidateRoads = [...candidateRoadIds]
      .map(roadId => roadsById.get(roadId))
      .filter((road): road is RoadSegment => road !== undefined);
    const trafficResults = await Promise.all(candidateRoads.map(async road => ({
      roadId: road.id,
      traffic: await getSegmentTrafficSpeed(
        road.id,
        road.roadType,
        road.speedKmph,
        road.coordinates
      )
    })));
    const trafficByRoadId = new Map(
      trafficResults.map(result => [result.roadId, result.traffic])
    );
    const graphEdges: GraphEdge[] = baseGraphEdges.map(edge => {
      const traffic = trafficByRoadId.get(edge.id);
      return traffic
        ? { ...edge, speedKmph: traffic.currentSpeedKmph }
        : edge;
    });

    const shortest = calculateDijkstraRoute(
      activeNodes,
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
      activeNodes,
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
      activeNodes,
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
        activeNodes,
        graphEdges,
        effectiveStartId,
        effectiveTargetId,
        'safest',
        parsedLambda,
        new Set(),
        new Set(),
        effectiveVehicleType
      );

    const trafficStatus = getTrafficFeedStatus();
    const liveTrafficSegments = trafficResults.filter(
      result => result.traffic.isLive
    ).length;
    const warnings = [
      rainfall.openMeteoStatus === 'OK'
        ? 'Flood-risk scores use gridded Open-Meteo rainfall data, not street-level sensor measurements.'
        : 'Open-Meteo rainfall is unavailable; rainfall-dependent risk is handled as unknown.',
      liveTrafficSegments === 0
        ? 'No successful live TomTom response was confirmed for this calculation; estimated road-class speeds were used.'
        : `Live TomTom speeds cover ${liveTrafficSegments} of ${roads.length} road segments; estimated speeds were used for the rest.`
    ];

    res.json({
      originNode: activeNodes[effectiveStartId],
      targetNode: activeNodes[effectiveTargetId],
      snappedOrigin,
      snappedDest,
      lambdaRisk: parsedLambda,
      shortest,
      fastest,
      safest,
      alternatives: safestAlternatives,
      dataQuality: {
        weather: {
          provider: rainfall.observations.find(observation => observation.source)?.source
            ?? 'Open-Meteo Forecast API',
          status: rainfall.openMeteoStatus,
          lastSuccessfulUpdate: rainfall.lastSuccessfulUpdate
        },
        traffic: {
          provider: trafficStatus.provider,
          liveSegments: liveTrafficSegments,
          sampledSegments: candidateRoads.length,
          networkSegments: roads.length,
          lastSuccessfulUpdate: trafficStatus.lastSuccessfulUpdate
        },
        warnings
      }
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
    const {
      locationName,
      lat,
      lng,
      reportType,
      description,
      severity,
      roadId,
      imageUrl,
      clientRequestId
    } = req.body || {};
    if (!locationName || !reportType || !severity) {
      return res.status(400).json({ error: 'Location name, report type, and severity are required.' });
    }
    if (
      clientRequestId !== undefined &&
      (typeof clientRequestId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(clientRequestId))
    ) {
      return res.status(400).json({ error: 'Client request ID must be a 1-128 character identifier.' });
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
      const snapped = snapCoordinateToRoadNetwork(parsedLat, parsedLng, activeNodes, currentRoads);
      targetRoadId = snapped.nearestRoad?.id;
    }

    const normalizedLocationName = String(locationName).trim();
    const normalizedDescription = String(description || 'Citizen reported water hazard').trim();
    const existingReport = clientRequestId
      ? db.getReportByClientRequestId(req.user!.id, clientRequestId)
      : null;
    if (
      existingReport &&
      (
        existingReport.locationName !== normalizedLocationName ||
        existingReport.lat !== parsedLat ||
        existingReport.lng !== parsedLng ||
        existingReport.reportType !== reportType ||
        existingReport.description !== normalizedDescription ||
        existingReport.severity !== severity ||
        existingReport.roadId !== targetRoadId
      )
    ) {
      return res.status(409).json({ error: 'Client request ID was already used for a different report.' });
    }

    const newReport: CommunityReport = existingReport || {
      id: `REP_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId: req.user!.id,
      userName: req.user!.fullName,
      roadId: targetRoadId,
      locationName: normalizedLocationName,
      lat: parsedLat,
      lng: parsedLng,
      reportType,
      description: normalizedDescription,
      severity,
      imageUrl: photoCheck.value,
      timestamp: new Date().toISOString(),
      verificationStatus: 'Reported',
      confidenceScore: photoCheck.value ? 0.78 : 0.65
    };

    if (!existingReport) {
      db.createReport(newReport, clientRequestId);
    }

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
    res.status(existingReport ? 200 : 201).json({ success: true, report: newReport, roads });
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

  app.post('/api/expert/alerts', writeLimiter, authenticateToken, requireAuthorityPermission('ALERT_CREATE'), (req: AuthenticatedRequest, res: Response) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const severity = req.body?.severity;
    const relatedRoadId = typeof req.body?.relatedRoadId === 'string' && req.body.relatedRoadId
      ? req.body.relatedRoadId
      : undefined;

    if (!title || title.length > 120 || !message || message.length > 2000) {
      return res.status(400).json({ error: 'Alert title (1–120 characters) and message (1–2000 characters) are required.' });
    }
    if (severity !== 'info' && severity !== 'warning' && severity !== 'critical') {
      return res.status(400).json({ error: 'Invalid alert severity.' });
    }
    if (relatedRoadId) {
      const scopedRoad = db.db.prepare(
        'SELECT road_id FROM road_segments WHERE road_id = ? AND authority_id = ?'
      ).get(relatedRoadId, req.authorityMembership!.authorityId);
      if (!scopedRoad) {
        return res.status(404).json({ error: 'Affected road was not found in this authority.' });
      }
    }

    const notification = withTransaction(() => {
      const created = db.createNotification({
        title,
        message,
        severity,
        ...(relatedRoadId ? { relatedRoadId } : {})
      });
      db.appendAuditLog(
        req.user!,
        'EXPERT_ALERT_CREATE',
        created.id,
        `Created in-app alert "${title}"${relatedRoadId ? ` for road ${relatedRoadId}` : ' for Pune & PCMC'}; external delivery is not configured.`,
        req.authorityMembership!.authorityId
      );
      return created;
    });

    res.status(201).json({
      success: true,
      notification,
      alert: {
        ...notification,
        createdById: req.user!.id,
        createdBy: req.user!.fullName,
        deliveryStatus: 'NOT_CONFIGURED'
      },
      publication: 'IN_APP_ONLY',
      deliveryStatus: 'NOT_CONFIGURED'
    });
  });

  app.get('/api/expert/alerts', authenticateToken, requireAuthorityRole('EXPERT'), (_req: AuthenticatedRequest, res: Response) => {
    res.json({ alerts: db.getExpertAlerts() });
  });

  app.get('/api/notifications', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json(db.getNotificationsForUser(req.user?.id));
  });

  app.patch('/api/notifications/:id/read', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    db.markNotificationRead(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/ai/live-token', createRateLimiter(60_000, 6), authenticateToken, requireCitizenOrActiveExpert(), async (req: AuthenticatedRequest, res: Response) => {
    if (!aiClient || !geminiApiKey) {
      return res.status(503).json({ error: 'Gemini Live is not configured.', errorCategory: 'not_configured' });
    }
    if (!SUPPORTED_LIVE_MODELS.has(geminiConfiguration.liveModel)) {
      return res.status(503).json({ error: 'The configured Gemini Live model is not supported.', errorCategory: 'unsupported_model' });
    }

    const now = Date.now();
    const expiresAt = new Date(now + 5 * 60_000).toISOString();
    const language = req.body?.lang === 'hi' ? 'Hindi' : req.body?.lang === 'mr' ? 'Marathi' : 'English';
    const liveSystemInstruction = `${LIVE_AI_SYSTEM_INSTRUCTION}\nRespond in ${language}.`;
    try {
      const token = await aiClient.authTokens.create({
        config: {
          uses: 1,
          expireTime: expiresAt,
          newSessionExpireTime: new Date(now + 60_000).toISOString(),
          // Constrained token configs lock their supplied fields; an extra mask rejects the tool schema.
          liveConnectConstraints: {
            model: geminiConfiguration.liveModel,
            config: {
              responseModalities: [Modality.AUDIO],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: liveSystemInstruction,
              tools: [{ functionDeclarations: [LIVE_BACKEND_TOOL] }],
              maxOutputTokens: geminiConfiguration.maxOutputTokens,
              sessionResumption: {}
            }
          },
          abortSignal: AbortSignal.timeout(geminiConfiguration.timeoutMs)
        }
      });
      if (!token.name) {
        return res.status(502).json({ error: 'Gemini did not issue a Live session token.', errorCategory: 'live_api_unavailable' });
      }
      return res.json({
        token: token.name,
        model: geminiConfiguration.liveModel,
        expiresAt
      });
    } catch (error) {
      const category = classifyGeminiError(error);
      console.warn(`[SanketSetu] Gemini Live token request failed (${category}).`);
      return res.status(503).json({
        error: 'Gemini Live is temporarily unavailable. Browser speech fallback remains available.',
        errorCategory: category === 'unknown' ? 'live_api_unavailable' : category
      });
    }
  });

  app.get('/api/ai/health', createRateLimiter(60_000, 10), authenticateToken, requireAuthorityRole('EXPERT'), async (_req: AuthenticatedRequest, res: Response) => {
    const textModelSupported = SUPPORTED_TEXT_MODELS.has(geminiConfiguration.textModel);
    const liveModelSupported = SUPPORTED_LIVE_MODELS.has(geminiConfiguration.liveModel);
    let textGenerationWorking: boolean | null = null;
    let liveApiAvailable: boolean | null = null;
    let textErrorCategory: string | null = null;
    let liveErrorCategory: string | null = null;

    if (!aiClient) {
      textErrorCategory = 'not_configured';
      liveErrorCategory = 'not_configured';
    } else {
      if (textModelSupported) {
        try {
          const result = await withGeminiRetry(() => aiClient!.models.generateContent({
            model: geminiConfiguration.textModel,
            contents: 'Reply with OK only.',
            config: {
              maxOutputTokens: 16,
              abortSignal: AbortSignal.timeout(geminiConfiguration.timeoutMs)
            }
          }));
          textGenerationWorking = Boolean(result.text?.trim());
          if (!textGenerationWorking) textErrorCategory = 'unknown';
        } catch (error) {
          textErrorCategory = classifyGeminiError(error);
        }
      } else {
        textErrorCategory = 'unsupported_model';
      }

      if (liveModelSupported) {
        try {
          const now = Date.now();
          await aiClient.authTokens.create({
            config: {
              uses: 1,
              expireTime: new Date(now + 5 * 60_000).toISOString(),
              newSessionExpireTime: new Date(now + 30_000).toISOString(),
              liveConnectConstraints: {
                model: geminiConfiguration.liveModel,
                config: {
                  responseModalities: [Modality.AUDIO],
                  systemInstruction: 'You are SanketSetu, a flood-safety assistant. Never invent live conditions or guarantee a route is safe.'
                }
              },
              abortSignal: AbortSignal.timeout(geminiConfiguration.timeoutMs)
            }
          });
          liveApiAvailable = true;
        } catch (error) {
          liveErrorCategory = 'live_api_unavailable';
          console.warn(`[SanketSetu] Gemini Live health check failed (${classifyGeminiError(error)}).`);
        }
      } else {
        liveErrorCategory = 'unsupported_model';
      }
    }

    res.json({
      configured: Boolean(geminiApiKey),
      textModelSupported,
      textGenerationWorking,
      textErrorCategory,
      liveModelSupported,
      liveApiAvailable,
      liveErrorCategory,
      checkedAt: new Date().toISOString()
    });
  });

  // ----------------- GEMINI AI ASSISTANT WITH LIVE BACKEND TOOLS -----------------

  app.post('/api/chatbot/message', writeLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
    const requestId = randomUUID();
    const endpoint = '/api/chatbot/message';
    const startedAt = Date.now();
    res.setHeader('X-Request-ID', requestId);
    const logCompletion = (status: number, aiStatus?: unknown, errorCategory?: unknown) => {
      console.info('[SanketSetu] Chatbot request completed.', {
        requestId,
        endpoint,
        httpStatus: status,
        durationMs: Date.now() - startedAt,
        aiStatus: aiStatus === 'available' || aiStatus === 'unavailable' ? aiStatus : undefined,
        errorCategory: typeof errorCategory === 'string' ? errorCategory : undefined
      });
    };
    const { message, lang = 'en', history, stream } = req.body || {};
    if (!message || !String(message).trim()) {
      logCompletion(400, 'unavailable', 'invalid_request');
      return res.status(400).json({
        error: 'Message is required.',
        errorCategory: 'invalid_request',
        requestId
      });
    }
    const userMessage = String(message).trim();
    if (userMessage.length > 4000) {
      logCompletion(400, 'unavailable', 'invalid_request');
      return res.status(400).json({
        error: 'Message must be 4,000 characters or fewer.',
        errorCategory: 'invalid_request',
        requestId
      });
    }
    const streamRequested = stream === true;
    const emitEvent = (event: string, value: unknown) => {
      if (!streamRequested || res.destroyed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
    };
    const respond = (value: Record<string, unknown>) => {
      const responseValue: Record<string, unknown> = { ...value, requestId };
      logCompletion(
        res.statusCode,
        responseValue.aiStatus,
        responseValue.errorCategory
      );
      if (!streamRequested) return res.json(responseValue);
      emitEvent('complete', responseValue);
      return res.end();
    };
    if (streamRequested) {
      res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.flushHeaders();
    }
    const safeHistory = Array.isArray(history) && geminiConfiguration.maxHistoryMessages > 0
      ? history
        .slice(-geminiConfiguration.maxHistoryMessages)
        .filter((entry: unknown): entry is { role: 'user' | 'model'; text: string } =>
          Boolean(
            entry &&
            typeof entry === 'object' &&
            ((entry as { role?: unknown }).role === 'user' || (entry as { role?: unknown }).role === 'model') &&
            typeof (entry as { text?: unknown }).text === 'string' &&
            (entry as { text: string }).text.trim()
          )
        )
        .map(entry => ({
          role: entry.role,
          parts: [{ text: entry.text.slice(0, 4000) }]
        }))
      : [];
    const { roads, rainfall } = await getAuthoritativeRoads(false);
    const shelters = db.getShelters();
    const reports = db.getReports();
    let aiErrorCategory: string | null = aiClient ? null : 'not_configured';

    // Live backend tool handlers (single source of truth)
    const executeTool = (name: string, args: Record<string, any> = {}): Record<string, unknown> => {
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
        const nodesList = Object.values(activeNodes);
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
        const safest = calculateDijkstraRoute(activeNodes, graphEdges, oNode.id, dNode.id, 'safest', 1.8);
        const fastest = calculateDijkstraRoute(activeNodes, graphEdges, oNode.id, dNode.id, 'fastest', 1.8);
        const shortest = calculateDijkstraRoute(activeNodes, graphEdges, oNode.id, dNode.id, 'shortest', 1.8);
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
      if (name === 'getCommunityReports') {
        return { reports: reports.slice(0, 25).map(report => ({
          locationName: report.locationName,
          type: report.reportType,
          severity: report.severity,
          verificationStatus: report.verificationStatus,
          timestamp: report.timestamp
        })) };
      }
      if (name === 'getAlerts') {
        return { alerts: db.getNotificationsForUser(req.user?.id).map(notification => ({
          title: notification.title,
          message: notification.message,
          severity: notification.severity,
          createdAt: notification.createdAt
        })) };
      }
      if (
        name === 'getDatasetStatus' &&
        req.user?.role === 'EXPERT' &&
        req.user.accountStatus === 'ACTIVE' &&
        db.getActiveAuthorityMembership(req.user.id)
      ) {
        const traffic = getTrafficFeedStatus();
        const rainfallTimestamp = rainfall.lastSuccessfulUpdate;
        const latestOsm = db.getLatestOsmSync();
        return {
          weather: {
            source: rainfall.observations.find(observation => observation.source)?.source ?? 'Open-Meteo Forecast API',
            status: rainfall.openMeteoStatus,
            lastSuccessfulUpdate: rainfallTimestamp
          },
          traffic: {
            source: traffic.provider,
            status: traffic.isLiveActive ? 'LIVE' : 'UNAVAILABLE',
            lastSuccessfulUpdate: traffic.lastSuccessfulUpdate
          },
          roadGraph: {
            source: 'OpenStreetMap ODbL-derived bundled road snapshot',
            lastSynchronization: latestOsm?.createdAt ?? null,
            status: latestOsm?.status ?? 'UNKNOWN'
          }
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
          },
          {
            name: 'getCommunityReports',
            description: 'List recent community flood reports with their recorded verification status. Never present unverified reports as verified hazards.',
            parameters: { type: Type.OBJECT, properties: {} }
          },
          {
            name: 'getAlerts',
            description: 'List alerts available to the authenticated user or public alerts when the user is not signed in.',
            parameters: { type: Type.OBJECT, properties: {} }
          }
        ];
        if (
          req.user?.role === 'EXPERT' &&
          req.user.accountStatus === 'ACTIVE' &&
          db.getActiveAuthorityMembership(req.user.id)
        ) {
          declarations.push({
            name: 'getDatasetStatus',
            description: 'Expert-only diagnostics for weather, traffic, and OSM road graph source status and update timestamps.',
            parameters: { type: Type.OBJECT, properties: {} }
          });
        }

        const systemInstruction = getSanketSetuAiSystemInstruction(lang);

        const userContents: Content[] = [
          ...safeHistory,
          { role: 'user' as const, parts: [{ text: userMessage }] }
        ];
        const generationConfig = {
          systemInstruction,
          tools: [{ functionDeclarations: declarations }],
          maxOutputTokens: geminiConfiguration.maxOutputTokens,
          abortSignal: AbortSignal.timeout(geminiConfiguration.timeoutMs)
        };
        const conversationConfig = {
          systemInstruction,
          maxOutputTokens: geminiConfiguration.maxOutputTokens,
          abortSignal: AbortSignal.timeout(geminiConfiguration.timeoutMs)
        };
        const requiresGrounding = requiresBackendGrounding(userMessage);

        const streamText = async (contents: Content[], config: GenerateContentConfig): Promise<string> => {
          for (let attempt = 0; attempt < 2; attempt += 1) {
            let generated = '';
            try {
              const chunks = await aiClient!.models.generateContentStream({
                model: geminiConfiguration.textModel,
                contents,
                config: { ...config, abortSignal: AbortSignal.timeout(geminiConfiguration.timeoutMs) }
              });
              for await (const chunk of chunks) {
                if (!chunk.text) continue;
                generated += chunk.text;
                emitEvent('delta', { text: chunk.text });
              }
              return generated;
            } catch (error) {
              if (generated) emitEvent('reset', {});
              if (attempt === 0 && isRetryableGeminiError(error) && !res.destroyed) {
                await new Promise(resolve => setTimeout(resolve, 400));
                continue;
              }
              throw error;
            }
          }
          return '';
        };

        if (streamRequested && !requiresGrounding) {
          const reply = await streamText(userContents, conversationConfig);
          if (reply.trim()) {
            return respond({
              reply,
              source: `Gemini AI (${geminiConfiguration.textModel})`,
              timestamp: new Date().toISOString(),
              aiStatus: 'available'
            });
          }
          aiErrorCategory = 'unknown';
        } else {
          const resp1 = await withGeminiRetry(() => aiClient!.models.generateContent({
            model: geminiConfiguration.textModel,
            contents: userContents,
            config: generationConfig
          }));

          const calls = resp1.functionCalls;
          const responseContent = resp1.candidates?.[0]?.content;
          if (calls && calls.length > 0 && responseContent) {
            const functionResponses: Content[] = calls.flatMap(call => {
              if (!call.name) return [];
              return [{
                role: 'user',
                parts: [{
                  functionResponse: {
                    ...(call.id ? { id: call.id } : {}),
                    name: call.name,
                    response: executeTool(call.name, (call.args || {}) as Record<string, any>)
                  }
                }]
              }];
            });

            const groundedContents = [
              ...userContents,
              responseContent,
              ...functionResponses
            ];
            const responseConfig: GenerateContentConfig = {
              ...generationConfig,
              abortSignal: AbortSignal.timeout(geminiConfiguration.timeoutMs)
            };

            let reply = '';
            if (streamRequested) {
              reply = await streamText(groundedContents, {
                systemInstruction,
                maxOutputTokens: geminiConfiguration.maxOutputTokens,
                tools: [{ functionDeclarations: declarations }],
                abortSignal: responseConfig.abortSignal
              });
            } else {
              const resp2 = await withGeminiRetry(() => aiClient!.models.generateContent({
                model: geminiConfiguration.textModel,
                contents: groundedContents,
                config: responseConfig
              }));
              reply = resp2.text || '';
            }

            if (reply.trim()) {
              return respond({
                reply,
                source: `Gemini AI (${geminiConfiguration.textModel}) grounded in SanketSetu Backend Tools`,
                timestamp: new Date().toISOString(),
                aiStatus: 'available'
              });
            }
            aiErrorCategory = 'tool_call_missing';
            if (streamRequested) emitEvent('reset', {});
          } else if (resp1.text && !requiresGrounding) {
            return respond({
              reply: resp1.text,
              source: `Gemini AI (${geminiConfiguration.textModel}) grounded in SanketSetu Context`,
              timestamp: new Date().toISOString(),
              aiStatus: 'available'
            });
          } else if (requiresGrounding) {
            aiErrorCategory = 'tool_call_missing';
          }
        }
      } catch (llmErr) {
        aiErrorCategory = classifyGeminiError(llmErr);
        const errorDetails = llmErr && typeof llmErr === 'object'
          ? llmErr as { name?: unknown; status?: unknown; code?: unknown }
          : {};
        const errorName = typeof errorDetails.name === 'string'
          ? errorDetails.name.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40)
          : 'UnknownError';
        const providerStatus = typeof errorDetails.status === 'number' &&
          Number.isInteger(errorDetails.status) ? errorDetails.status : undefined;
        const providerCode = typeof errorDetails.code === 'string' &&
          /^[A-Za-z0-9_.-]{1,60}$/.test(errorDetails.code) ? errorDetails.code : undefined;
        console.warn('[SanketSetu] Gemini request failed.', {
          requestId,
          endpoint,
          httpStatus: res.statusCode,
          providerStatus: providerStatus ?? null,
          durationMs: Date.now() - startedAt,
          errorCategory: aiErrorCategory,
          errorName,
          providerCode
        });
        if (streamRequested) emitEvent('reset', {});
      }
    }

    // Honest deterministic live-data summary when GEMINI_API_KEY is not configured or unavailable
    const closed = roads.filter(r => r.status === 'CLOSED');
    const hazards = roads.filter(r => r.status === 'VERIFIED_HAZARD');
    const reported = roads.filter(r => r.status === 'REPORTED_WATERLOGGING');
    const observedRainfall = rainfall.observations
      .map(observation => observation.observedPast24hMm)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const maxRain = observedRainfall.length ? Math.max(...observedRainfall) : null;

    const summary =
      lang === 'mr'
        ? `संकेतसेतूचा पडताळलेला बॅकएंड डेटा (AI उपलब्ध नाही: ${aiErrorCategory}): पुणे २४ तास पर्जन्यमान ${rainfall.openMeteoStatus === 'OK' && maxRain !== null ? `${maxRain} मि.मी.` : 'उपलब्ध नाही'}. अधिकृत बंद रस्ते: ${closed.length}, तज्ञ-पडताळलेले धोके: ${hazards.length}, अपडताळलेले नागरिक अहवाल: ${reported.length}. पर्जन्यमानाची शेवटची यशस्वी नोंद: ${rainfall.lastSuccessfulUpdate || 'अज्ञात'}.`
        : lang === 'hi'
        ? `संकेतसेतु सत्यापित बैकएंड डेटा (AI उपलब्ध नहीं: ${aiErrorCategory}): पुणे में पिछले 24 घंटे की वर्षा ${rainfall.openMeteoStatus === 'OK' && maxRain !== null ? `${maxRain} मिमी` : 'उपलब्ध नहीं'}। आधिकारिक बंद सड़कें: ${closed.length}, सत्यापित खतरे: ${hazards.length}, अप्रमाणित नागरिक रिपोर्ट: ${reported.length}। वर्षा डेटा का अंतिम सफल अपडेट: ${rainfall.lastSuccessfulUpdate || 'अज्ञात'}।`
        : `SanketSetu verified backend data (AI unavailable: ${aiErrorCategory}): ` +
          `Pune maximum observed 24-hour rainfall: ${rainfall.openMeteoStatus === 'OK' && maxRain !== null ? `${maxRain} mm` : 'Unavailable'}. ` +
          `Official closures: ${closed.length > 0 ? closed.map(r => r.name).join(', ') : 'None'}. ` +
          `Verified hazards: ${hazards.length > 0 ? hazards.map(r => r.name).join(', ') : 'None'}. ` +
          `Unverified citizen waterlogging reports: ${reported.length}. ` +
          `Rainfall last successful update: ${rainfall.lastSuccessfulUpdate || 'Unknown'}.`;

    respond({
      reply: summary,
      source: 'Verified SanketSetu backend telemetry (not an AI-generated answer)',
      timestamp: new Date().toISOString(),
      aiStatus: 'unavailable',
      errorCategory: aiErrorCategory
    });
  });

  return { app, db };
}

async function isPortAvailable(port: number, host: string): Promise<boolean> {
  const probe = createTcpServer();

  return new Promise<boolean>((resolve, reject) => {
    probe.once('error', error => {
      if ('code' in error && error.code === 'EADDRINUSE') {
        resolve(false);
        return;
      }
      reject(error);
    });

    probe.listen(port, host, () => {
      probe.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve(true);
      });
    });
  });
}

async function isHealthyFloodGuard(port: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: controller.signal
    });
    if (!response.ok) return false;

    const health: unknown = await response.json();
    return (
      typeof health === 'object' &&
      health !== null &&
      'status' in health &&
      health.status === 'ok' &&
      'service' in health &&
      health.service === 'SanketSetu Intelligence Platform'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[FloodGuard] Existing listener health check failed: ${message}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST || '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer from 1 to 65535; received "${process.env.PORT}".`);
  }

  if (!(await isPortAvailable(port, host))) {
    if (await isHealthyFloodGuard(port)) {
      console.log(`[FloodGuard] Frontend already serving at http://localhost:${port}/.`);
      console.log(`[FloodGuard] Backend API is healthy at http://localhost:${port}/api/health.`);
      console.log('[FloodGuard] Duplicate development launch skipped; the existing server was left untouched.');
      return;
    }

    console.error(`[FloodGuard] Port ${port} is already occupied by a service that did not identify itself as FloodGuard.`);
    console.error('[FloodGuard] No second server was started. Identify the listener with Get-NetTCPConnection and Get-CimInstance Win32_Process.');
    process.exitCode = 1;
    return;
  }

  const { app, db } = createSanketSetuApp();
  const httpServer = createHttpServer(app);
  const isDev = process.env.NODE_ENV !== 'production';
  let closeVite: (() => Promise<void>) | undefined;
  let isShuttingDown = false;

  const cleanup = async (): Promise<void> => {
    stopScheduledOsmSync();
    if (closeVite) {
      try {
        await closeVite();
      } catch (error) {
        console.error('[FloodGuard] Failed to close Vite cleanly:', error);
      }
    }
    if (httpServer.listening) {
      try {
        await new Promise<void>((resolve, reject) => {
          httpServer.close(error => error ? reject(error) : resolve());
        });
      } catch (error) {
        console.error('[FloodGuard] Failed to close the HTTP server cleanly:', error);
      }
    }
    try {
      db.close();
    } catch (error) {
      console.error('[FloodGuard] Failed to close SQLite cleanly:', error);
    }
  };

  try {
    if (isDev) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === 'true'
            ? false
            : { server: httpServer }
        },
        appType: 'spa'
      });
      closeVite = () => vite.close();
      app.use(vite.middlewares);
    } else {
      app.use(express.static(resolve('dist')));
      app.get('*', (_req, res) => {
        res.sendFile(resolve('dist/index.html'));
      });
    }

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      httpServer.once('error', onError);
      httpServer.listen(port, host, () => {
        httpServer.off('error', onError);
        resolve();
      });
    });

    console.log(`[FloodGuard] Backend API listening on http://${host}:${port}.`);
    console.log(`[FloodGuard] ${isDev ? 'Vite frontend middleware' : 'Built frontend'} serving on http://localhost:${port}/.`);
    console.log(`[FloodGuard] SQLite connected at ${db.dbPath}.`);

    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`[FloodGuard] ${signal} received; closing frontend, backend, OSM scheduler, and SQLite.`);
      await cleanup();
      console.log('[FloodGuard] Shutdown complete.');
    };
    process.once('SIGINT', () => { void shutdown('SIGINT'); });
    process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  } catch (error) {
    await cleanup();
    throw error;
  }
}

const isEntrypoint = Boolean(process.argv[1] && process.argv[1].endsWith('server.ts'));
if (isEntrypoint && process.env.SANKETSETU_NO_LISTEN !== '1') {
  startServer().catch(error => {
    console.error('[FloodGuard] Startup failed:', error);
    process.exitCode = 1;
  });
}
