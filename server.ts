import express, { Request, Response, NextFunction } from 'express';
import { Content, FunctionDeclaration, GenerateContentConfig, GoogleGenAI, Modality, Type } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { randomUUID, timingSafeEqual } from 'node:crypto';
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
  User,
  UserRole
} from './src/types';

dotenv.config();

export interface AuthenticatedRequest extends Request {
  user?: User;
}

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

function matchesSecret(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
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

  function requireRoles(roles: UserRole[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: `Access denied. Requires role: ${roles.join(', ')}` });
      }
      if (req.user.accountStatus !== 'ACTIVE') {
        return res.status(403).json({ error: `Account is ${req.user.accountStatus}. Active clearance required.` });
      }
      next();
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
    db.saveRoadSegments(computed);
    return { roads: computed, rainfall };
  }

  // ----------------- AUTHENTICATION ENDPOINTS (Strictly 2 Roles: CITIZEN, EXPERT) -----------------

  app.post('/api/auth/citizen/register', authLimiter, (req: Request, res: Response) => {
    const { fullName, email, password, phone, preferredLanguage } = req.body || {};
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'Full name, email, and password are required.' });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
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
    const found = db.getUserByEmail(String(email));
    if (!found || !verifyPassword(String(password), found.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
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
    const { fullName, email, password, organisation, designation, phone } = req.body || {};
    if (!fullName || !email || !password || !organisation || !designation) {
      return res.status(400).json({
        error: 'Full name, official email, organisation, designation, and password are required.'
      });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please provide a valid official email address.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }
    if (db.getUserByEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
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
      appliedAt: now
    };
    db.createExpertRegistration(newExpert, application);

    const { passwordHash, ...safeUser } = newExpert;
    res.status(201).json({
      success: true,
      user: safeUser,
      application,
      message: 'Expert registration submitted. Account remains PENDING_APPROVAL until verified by an active authorized Expert.'
    });
  });

  app.post('/api/auth/expert/login', authLimiter, (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
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
    res.json({
      success: true,
      token,
      user: safeUser,
      message: 'Expert authority login verified.'
    });
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
    const token = generateToken(safeUser);
    res.json({ success: true, token, user: safeUser });
  });

  app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    res.json({ success: true, user: req.user });
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

  // ----------------- EXPERT PEER APPROVAL & SECRET BOOTSTRAP (NO ADMIN ROLE) -----------------

  app.get('/api/expert/applications', authenticateToken, requireRoles(['EXPERT']), (_req: AuthenticatedRequest, res: Response) => {
    res.json(db.getExpertApplications());
  });

  app.patch('/api/expert/applications/:id/approve', authenticateToken, requireRoles(['EXPERT']), (req: AuthenticatedRequest, res: Response) => {
    const existing = db.getExpertApplicationById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Application not found.' });
    if (existing.userId === req.user!.id) {
      return res.status(403).json({ error: 'An Expert cannot approve their own application.' });
    }
    if (existing.status !== 'PENDING_APPROVAL') {
      return res.status(409).json({ error: 'This application has already been reviewed.' });
    }

    const updated = db.updateExpertApplicationStatus(req.params.id, 'ACTIVE', req.user!);
    if (!updated) return res.status(409).json({ error: 'This application has already been reviewed.' });
    res.json({ success: true, application: updated, message: `Approved expert ${updated.fullName}` });
  });

  app.patch('/api/expert/applications/:id/reject', authenticateToken, requireRoles(['EXPERT']), (req: AuthenticatedRequest, res: Response) => {
    const existing = db.getExpertApplicationById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Application not found.' });
    if (existing.userId === req.user!.id) {
      return res.status(403).json({ error: 'An Expert cannot reject their own application.' });
    }
    if (existing.status !== 'PENDING_APPROVAL') {
      return res.status(409).json({ error: 'This application has already been reviewed.' });
    }

    const updated = db.updateExpertApplicationStatus(req.params.id, 'REJECTED', req.user!);
    if (!updated) return res.status(409).json({ error: 'This application has already been reviewed.' });
    res.json({ success: true, application: updated, message: `Rejected application for ${updated.fullName}` });
  });

  // One-time initial deployment bootstrap; subsequent reviews require an active Expert session.
  app.post('/api/expert/applications/:id/bootstrap-approve', authLimiter, (req: Request, res: Response) => {
    const configuredSecret = process.env.EXPERT_APPROVAL_SECRET?.trim();
    const reviewerId = process.env.EXPERT_BOOTSTRAP_REVIEWER_ID?.trim();
    const reviewerName = process.env.EXPERT_BOOTSTRAP_REVIEWER_NAME?.trim();
    if (!configuredSecret || Buffer.byteLength(configuredSecret, 'utf8') < 32 || !reviewerId || !reviewerName) {
      return res.status(503).json({
        error: 'Initial Expert bootstrap is not configured. Set a 32+ byte secret and the provisioning reviewer ID and name on the server.'
      });
    }
    const supplied = req.get('x-expert-approval-secret');
    if (!supplied || !matchesSecret(supplied, configuredSecret)) {
      return res.status(403).json({ error: 'Invalid approval secret.' });
    }

    const result = db.bootstrapApproveExpertApplication(req.params.id, reviewerId, reviewerName);
    if (!('application' in result)) {
      if (result.status === 'bootstrap_closed') {
        return res.status(409).json({
          error: 'Initial Expert bootstrap is closed. An active Expert must review this application.'
        });
      }
      if (result.status === 'not_found') return res.status(404).json({ error: 'Application not found.' });
      return res.status(409).json({ error: 'This application has already been reviewed.' });
    }
    res.json({ success: true, application: result.application, message: 'Initial Expert approval completed.' });
  });

  app.get('/api/expert/audit-logs', authenticateToken, requireRoles(['EXPERT']), (_req: AuthenticatedRequest, res: Response) => {
    res.json({ auditLogs: db.getAuditLogs() });
  });

  // ----------------- OPERATIONAL & GEOSPATIAL ENDPOINTS -----------------

  app.get('/api/health', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
    const rainfall = await getLiveRainfallFeed(false);
    const isActiveExpert =
      req.user?.role === 'EXPERT' && req.user.accountStatus === 'ACTIVE';
    res.json({
      status: 'ok',
      region: 'Pune & Pimpri-Chinchwad, Maharashtra, India',
      rolesSupported: ['CITIZEN', 'EXPERT'],
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

  app.patch('/api/roads/:id/status', writeLimiter, authenticateToken, requireRoles(['EXPERT']), (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { status, riskScore, reason, expiresInHours } = req.body || {};
    const validStatuses: RoadStatus[] = ['OPEN', 'REPORTED_WATERLOGGING', 'VERIFIED_HAZARD', 'CLOSED', 'UNKNOWN'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid road status. Must be one of: ${validStatuses.join(', ')}` });
    }
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) {
      return res.status(400).json({ error: 'A concise operational reason is required when updating road status.' });
    }

    const currentRoad = db.getRoadSegments().find(road => road.id === id);
    if (!currentRoad) {
      return res.status(404).json({ error: 'Road segment not found.' });
    }
    const nextRisk: number | null =
      typeof riskScore === 'number'
        ? Math.max(0, Math.min(100, riskScore))
        : currentRoad.riskScore;

    const expiresAt =
      typeof expiresInHours === 'number' && expiresInHours > 0
        ? new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString()
        : null;

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
      `Status set to ${status} (Risk: ${nextRisk ?? 'Unknown'}). Reason: ${cleanReason}${expiresAt ? ` | Expires: ${expiresAt}` : ''}`
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

  app.get('/api/traffic/status', authenticateToken, requireRoles(['EXPERT']), (_req: AuthenticatedRequest, res: Response) => {
    res.json(getTrafficFeedStatus());
  });

  app.get('/api/network/status', authenticateToken, requireRoles(['EXPERT']), (_req: AuthenticatedRequest, res: Response) => {
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

  app.post('/api/expert/network/sync', writeLimiter, authenticateToken, requireRoles(['EXPERT']), async (req: AuthenticatedRequest, res: Response) => {
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

  app.patch('/api/shelters/:id', writeLimiter, authenticateToken, requireRoles(['EXPERT']), (req: AuthenticatedRequest, res: Response) => {
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
      `Occupancy updated to ${updatedShelter.currentOccupancy}/${updatedShelter.capacity}`
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

  app.patch('/api/reports/:id/verify', writeLimiter, authenticateToken, requireRoles(['EXPERT']), async (req: AuthenticatedRequest, res: Response) => {
    const { verificationStatus, officialAction, reviewNotes, expiresInHours } = req.body || {};
    const validStates: CommunityReport['verificationStatus'][] = ['Reported', 'Under Review', 'Verified', 'Rejected', 'Resolved'];
    if (!validStates.includes(verificationStatus)) {
      return res.status(400).json({ error: 'Invalid verification status.' });
    }

    const confidence =
      verificationStatus === 'Verified' ? 0.95 :
      verificationStatus === 'Rejected' ? 0.20 :
      verificationStatus === 'Resolved' ? 0.90 : 0.72;

    const updated = db.updateReportVerification({
      reportId: req.params.id,
      verificationStatus,
      confidenceScore: confidence,
      reviewedBy: req.user!.fullName,
      reviewNotes: reviewNotes ? String(reviewNotes) : undefined,
      resolvedAt: verificationStatus === 'Resolved' ? new Date().toISOString() : undefined
    });

    if (!updated) return res.status(404).json({ error: 'Report not found.' });

    const expiresAt =
      typeof expiresInHours === 'number' && expiresInHours > 0
        ? new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString()
        : null;

    const currentReportedRoad = updated.roadId
      ? db.getRoadSegments().find(road => road.id === updated.roadId)
      : undefined;

    if (verificationStatus === 'Verified' && updated.roadId) {
      db.createVerifiedHazard({
        reportId: updated.id,
        roadId: updated.roadId,
        hazardType: updated.reportType,
        severity: updated.severity,
        description: updated.description,
        actor: req.user!,
        expiresAt
      });

      const shouldClose = officialAction === 'close_road';
      db.updateRoadStatus({
        roadId: updated.roadId,
        status: shouldClose ? 'CLOSED' : 'VERIFIED_HAZARD',
        riskScore: currentReportedRoad?.riskScore ?? null,
        riskCategory: currentReportedRoad?.riskCategory ?? 'Unknown',
        reason: reviewNotes ? String(reviewNotes) : `Expert-verified ${updated.reportType} near ${updated.locationName}`,
        expiresAt,
        actor: req.user!
      });
    } else if (verificationStatus === 'Resolved' && updated.roadId) {
      db.updateRoadStatus({
        roadId: updated.roadId,
        status: 'OPEN',
        riskScore: currentReportedRoad?.riskScore ?? null,
        riskCategory: currentReportedRoad?.riskCategory ?? 'Unknown',
        reason: reviewNotes ? String(reviewNotes) : `Incident ${updated.id} marked resolved`,
        expiresAt: null,
        actor: req.user!
      });
    }

    db.appendAuditLog(
      req.user!,
      'INCIDENT_VERIFICATION',
      updated.id,
      `Report status changed to ${verificationStatus} for ${updated.locationName}${officialAction ? ` (action: ${officialAction})` : ''}`
    );

    // Notify reporting citizen
    db.createNotification({
      userId: updated.userId,
      title: `Report ${verificationStatus}: ${updated.locationName}`,
      message: `${req.user!.fullName} updated your ${updated.reportType} report to ${verificationStatus}.${reviewNotes ? ` Note: ${reviewNotes}` : ''}`,
      severity: verificationStatus === 'Verified' ? 'warning' : 'info',
      relatedRoadId: updated.roadId,
      relatedReportId: updated.id
    });

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

  app.post('/api/expert/alerts', writeLimiter, authenticateToken, requireRoles(['EXPERT']), (req: AuthenticatedRequest, res: Response) => {
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
    if (relatedRoadId && !db.getRoadSegments().some(road => road.id === relatedRoadId)) {
      return res.status(400).json({ error: 'Affected road was not found in the configured road network.' });
    }

    const notification = db.createNotification({
      title,
      message,
      severity,
      ...(relatedRoadId ? { relatedRoadId } : {})
    });
    db.appendAuditLog(
      req.user!,
      'EXPERT_ALERT_CREATE',
      notification.id,
      `Created in-app alert "${title}"${relatedRoadId ? ` for road ${relatedRoadId}` : ' for Pune & PCMC'}; external delivery is not configured.`
    );

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

  app.get('/api/expert/alerts', authenticateToken, requireRoles(['EXPERT']), (_req: AuthenticatedRequest, res: Response) => {
    res.json({ alerts: db.getExpertAlerts() });
  });

  app.get('/api/notifications', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json(db.getNotificationsForUser(req.user?.id));
  });

  app.patch('/api/notifications/:id/read', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    db.markNotificationRead(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/ai/live-token', createRateLimiter(60_000, 6), authenticateToken, requireRoles(['CITIZEN', 'EXPERT']), async (req: AuthenticatedRequest, res: Response) => {
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

  app.get('/api/ai/health', createRateLimiter(60_000, 10), authenticateToken, requireRoles(['EXPERT']), async (_req: AuthenticatedRequest, res: Response) => {
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
      if (name === 'getDatasetStatus' && req.user?.role === 'EXPERT' && req.user.accountStatus === 'ACTIVE') {
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
        if (req.user?.role === 'EXPERT' && req.user.accountStatus === 'ACTIVE') {
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
