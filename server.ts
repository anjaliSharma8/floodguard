import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import crypto from 'crypto';
import {
  PUNE_ROAD_NODES,
  INITIAL_ROAD_SEGMENTS,
  INITIAL_SHELTERS,
  INITIAL_HOSPITALS,
  INITIAL_EMERGENCY_FACILITIES,
  INITIAL_COMMUNITY_REPORTS,
  INITIAL_POLLS,
  INITIAL_RAINFALL,
  INITIAL_HISTORICAL_FLOODS
} from './src/data/puneData';
import { calculateFloodRisk, calculateDijkstraRoute, calculatePollBreakdown } from './src/utils/rules';
import { 
  RoadSegment, 
  Shelter, 
  CommunityReport, 
  LivePoll, 
  RouteFeedback, 
  User, 
  UserRole, 
  AccountStatus,
  ExpertApplication,
  AuditLog
} from './src/types';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

import { hashPassword, verifyPassword, generateToken, decodeToken } from './src/utils/auth';

// ----------------- Database State -----------------

interface StoredUser extends User {
  passwordHash: string;
}

// Pre-seeded demonstration accounts (Section 4 & 5)
let users: StoredUser[] = [
  {
    id: 'USR_CITIZEN_01',
    fullName: 'Anjali Sharma',
    email: 'citizen@pune.in',
    phone: '+91-9822012345',
    passwordHash: hashPassword('Citizen@123'),
    role: 'CITIZEN',
    accountStatus: 'ACTIVE',
    createdAt: '2026-10-30T08:00:00Z',
    preferredLanguage: 'en'
  },
  {
    id: 'USR_EXPERT_01',
    fullName: 'Dr. Rajiv Kulkarni',
    email: 'officer.kulkarni@pmc.gov.in',
    phone: '+91-9823098765',
    passwordHash: hashPassword('Expert@123'),
    role: 'EXPERT',
    accountStatus: 'ACTIVE',
    organisation: 'Pune Municipal Disaster Management Cell',
    designation: 'Senior Disaster Management Officer',
    createdAt: '2026-10-25T09:00:00Z',
    preferredLanguage: 'en'
  },
  {
    id: 'USR_EXPERT_PENDING_01',
    fullName: 'Capt. Vikram Deshmukh',
    email: 'deshmukh@ndrf.gov.in',
    phone: '+91-9824055555',
    passwordHash: hashPassword('Expert@123'),
    role: 'EXPERT',
    accountStatus: 'PENDING_APPROVAL',
    organisation: 'NDRF 5th Battalion Talegaon',
    designation: 'Deputy Commandant Flood Operations',
    createdAt: '2026-10-31T14:30:00Z',
    preferredLanguage: 'en'
  },
  {
    id: 'USR_ADMIN_01',
    fullName: 'State Disaster Commissioner',
    email: 'admin@floodguard.pune.gov.in',
    phone: '+91-20-25501269',
    passwordHash: hashPassword('Admin@FloodGuard2026'),
    role: 'ADMIN',
    accountStatus: 'ACTIVE',
    organisation: 'Maharashtra State Disaster Management Authority',
    designation: 'Chief Disaster Logistics Administrator',
    createdAt: '2026-10-01T00:00:00Z',
    preferredLanguage: 'en'
  }
];

let expertApplications: ExpertApplication[] = [
  {
    id: 'APP_01',
    userId: 'USR_EXPERT_PENDING_01',
    fullName: 'Capt. Vikram Deshmukh',
    email: 'deshmukh@ndrf.gov.in',
    organisation: 'NDRF 5th Battalion Talegaon',
    designation: 'Deputy Commandant Flood Operations',
    status: 'PENDING_APPROVAL',
    appliedAt: '2026-10-31T14:30:00Z'
  }
];

let auditLogs: AuditLog[] = [
  {
    id: 'LOG_01',
    actorId: 'USR_EXPERT_01',
    actorName: 'Dr. Rajiv Kulkarni',
    actorRole: 'EXPERT',
    action: 'ROAD_STATUS_CHANGE',
    targetResource: 'R03 (Sinhagad Road)',
    details: 'Status changed to critical_waterlogged due to 18,400 cusecs Khadakwasla Dam release',
    timestamp: '2026-10-30T08:15:00Z'
  },
  {
    id: 'LOG_02',
    actorId: 'USR_EXPERT_01',
    actorName: 'Dr. Rajiv Kulkarni',
    actorRole: 'EXPERT',
    action: 'REPORT_VERIFICATION',
    targetResource: 'REP_101',
    details: 'Verified citizen waterlogging report near Ekta Nagari',
    timestamp: '2026-10-30T08:20:00Z'
  }
];

function logAudit(actor: User, action: string, targetResource: string, details: string) {
  const newLog: AuditLog = {
    id: `LOG_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    action,
    targetResource,
    details,
    timestamp: new Date().toISOString()
  };
  auditLogs.unshift(newLog);
}

// In-memory state synchronized from datasets
let currentRoadSegments: RoadSegment[] = JSON.parse(JSON.stringify(INITIAL_ROAD_SEGMENTS));
let currentShelters: Shelter[] = JSON.parse(JSON.stringify(INITIAL_SHELTERS));
let currentReports: CommunityReport[] = JSON.parse(JSON.stringify(INITIAL_COMMUNITY_REPORTS));
let currentPolls: LivePoll[] = JSON.parse(JSON.stringify(INITIAL_POLLS));
let currentRouteFeedback: RouteFeedback[] = [
  {
    id: 'FB_01',
    userId: 'USR_CITIZEN_01',
    userName: 'Anjali Sharma',
    routeName: 'Karve Road Alternative to Kothrud',
    reachedSafely: true,
    routeCondition: 'Clear with light puddles near Paud flyover',
    waterLevelCategory: 'None / Minor',
    travelTimeMins: 12,
    rating: 5,
    timestamp: new Date().toISOString()
  }
];

// Initialize Gemini if key exists
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (apiKey) {
  try {
    aiClient = new GoogleGenAI({ apiKey });
  } catch (err) {
    console.warn('Failed to initialize GoogleGenAI client, will use fallback RAG.', err);
  }
}

// ----------------- Auth Middleware -----------------

export interface AuthenticatedRequest extends Request {
  user?: User;
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

  const found = users.find(u => u.id === decoded.userId);
  if (!found) {
    return res.status(401).json({ error: 'User account no longer exists.' });
  }

  if (found.accountStatus === 'SUSPENDED') {
    return res.status(403).json({ error: 'Your account has been suspended by authorities.' });
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
      return res.status(403).json({ error: `Access denied. Requires one of roles: ${roles.join(', ')}` });
    }
    if (req.user.accountStatus !== 'ACTIVE') {
      return res.status(403).json({ error: `Account is ${req.user.accountStatus}. Active clearance required.` });
    }
    next();
  };
}

// ----------------- AUTHENTICATION ENDPOINTS (Section 4 & 5) -----------------

// Citizen Signup
app.post('/api/auth/citizen/register', (req: Request, res: Response) => {
  const { fullName, email, password, phone, preferredLanguage } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Full name, email, and password are required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (users.some(u => u.email.toLowerCase() === normalizedEmail)) {
    return res.status(400).json({ error: 'An account with this email address already exists.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const newUser: StoredUser = {
    id: `USR_CITIZEN_${Date.now()}`,
    fullName: fullName.trim(),
    email: normalizedEmail,
    phone: phone ? phone.trim() : undefined,
    passwordHash: hashPassword(password),
    role: 'CITIZEN',
    accountStatus: 'ACTIVE',
    createdAt: new Date().toISOString(),
    preferredLanguage: preferredLanguage || 'en'
  };

  users.push(newUser);

  const { passwordHash, ...safeUser } = newUser;
  const token = generateToken(safeUser);

  res.status(201).json({
    success: true,
    token,
    user: safeUser,
    message: 'Citizen account created successfully.'
  });
});

// Citizen Login
app.post('/api/auth/citizen/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const found = users.find(u => u.email.toLowerCase() === normalizedEmail);

  if (!found || !verifyPassword(password, found.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (found.accountStatus === 'SUSPENDED') {
    return res.status(403).json({ error: 'Your account has been suspended. Please contact authorities.' });
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

// Expert Signup (creates PENDING_APPROVAL account, Section 4.C)
app.post('/api/auth/expert/register', (req: Request, res: Response) => {
  const { fullName, email, password, organisation, designation, phone } = req.body;

  if (!fullName || !email || !password || !organisation || !designation) {
    return res.status(400).json({ 
      error: 'Full name, official email, organisation, designation, and password are required for expert registration.' 
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (users.some(u => u.email.toLowerCase() === normalizedEmail)) {
    return res.status(400).json({ error: 'An account with this email address already exists.' });
  }

  const newExpert: StoredUser = {
    id: `USR_EXPERT_${Date.now()}`,
    fullName: fullName.trim(),
    email: normalizedEmail,
    phone: phone ? phone.trim() : undefined,
    passwordHash: hashPassword(password),
    role: 'EXPERT',
    accountStatus: 'PENDING_APPROVAL', // Strict security: must be approved by admin
    organisation: organisation.trim(),
    designation: designation.trim(),
    createdAt: new Date().toISOString()
  };

  users.push(newExpert);

  // Add to applications registry
  const application: ExpertApplication = {
    id: `APP_${Date.now()}`,
    userId: newExpert.id,
    fullName: newExpert.fullName,
    email: newExpert.email,
    organisation: organisation.trim(),
    designation: designation.trim(),
    status: 'PENDING_APPROVAL',
    appliedAt: new Date().toISOString()
  };
  expertApplications.unshift(application);

  const { passwordHash, ...safeUser } = newExpert;

  res.status(201).json({
    success: true,
    user: safeUser,
    message: 'Expert registration submitted. Your account is currently PENDING_APPROVAL by disaster authorities.'
  });
});

// Expert Login
app.post('/api/auth/expert/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const found = users.find(u => u.email.toLowerCase() === normalizedEmail);

  if (!found || !verifyPassword(password, found.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Check roles: must be EXPERT or ADMIN
  if (found.role !== 'EXPERT' && found.role !== 'ADMIN') {
    return res.status(403).json({ 
      error: 'This account does not have Disaster Authority clearance. Please log in via Citizen Mode.' 
    });
  }

  // Account status verification
  if (found.accountStatus === 'PENDING_APPROVAL') {
    return res.status(403).json({
      error: 'Your expert application is awaiting administrator verification. Access to operational controls is restricted until approval.',
      accountStatus: 'PENDING_APPROVAL'
    });
  }

  if (found.accountStatus === 'REJECTED') {
    return res.status(403).json({
      error: 'Your expert application was reviewed and rejected by administrators.',
      accountStatus: 'REJECTED'
    });
  }

  if (found.accountStatus === 'SUSPENDED') {
    return res.status(403).json({
      error: 'Your expert account has been suspended. Operational privileges revoked.',
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

// Get current authenticated user
app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, user: req.user });
});

// Logout
app.post('/api/auth/logout', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Forgot password simulation
app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;
  res.json({
    success: true,
    message: `Password reset instructions have been sent to ${email} if registered with Pune Disaster Cell.`
  });
});

// ----------------- ADMIN EXPERT APPROVAL ENDPOINTS (Section 4.E & 18) -----------------

app.get('/api/admin/expert-applications', authenticateToken, requireRoles(['ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  res.json(expertApplications);
});

app.patch('/api/admin/expert-applications/:id/approve', authenticateToken, requireRoles(['ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const appItem = expertApplications.find(a => a.id === id);
  if (!appItem) return res.status(404).json({ error: 'Application not found' });

  appItem.status = 'ACTIVE';
  appItem.reviewedAt = new Date().toISOString();
  appItem.reviewedBy = req.user?.fullName;

  const targetUser = users.find(u => u.id === appItem.userId);
  if (targetUser) {
    targetUser.accountStatus = 'ACTIVE';
  }

  if (req.user) {
    logAudit(req.user, 'EXPERT_APPROVAL', appItem.userId, `Approved expert privileges for ${appItem.fullName} (${appItem.organisation})`);
  }

  res.json({ success: true, application: appItem, message: `Approved expert ${appItem.fullName}` });
});

app.patch('/api/admin/expert-applications/:id/reject', authenticateToken, requireRoles(['ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const appItem = expertApplications.find(a => a.id === id);
  if (!appItem) return res.status(404).json({ error: 'Application not found' });

  appItem.status = 'REJECTED';
  appItem.reviewedAt = new Date().toISOString();
  appItem.reviewedBy = req.user?.fullName;

  const targetUser = users.find(u => u.id === appItem.userId);
  if (targetUser) {
    targetUser.accountStatus = 'REJECTED';
  }

  if (req.user) {
    logAudit(req.user, 'EXPERT_REJECTION', appItem.userId, `Rejected expert application for ${appItem.fullName} (${appItem.organisation})`);
  }

  res.json({ success: true, application: appItem, message: `Rejected expert application for ${appItem.fullName}` });
});

// ----------------- AUDIT LOGS ENDPOINTS (Section 7.I & 18) -----------------

app.get('/api/expert/audit-logs', authenticateToken, requireRoles(['EXPERT', 'ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  res.json({ auditLogs });
});

// ----------------- OPERATIONAL DATA ENDPOINTS -----------------

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'FloodGuard Intelligence Platform',
    region: 'Pune & Pimpri-Chinchwad, Maharashtra, India',
    authRequired: true,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/roads', (req: Request, res: Response) => {
  res.json({ nodes: PUNE_ROAD_NODES, segments: currentRoadSegments });
});

// Updating road status requires EXPERT or ADMIN authentication!
app.patch('/api/roads/:id/status', authenticateToken, requireRoles(['EXPERT', 'ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status, riskScore } = req.body;
  const road = currentRoadSegments.find(r => r.id === id);
  if (!road) {
    return res.status(404).json({ error: 'Road segment not found' });
  }

  const oldStatus = road.status;
  if (status) road.status = status;
  if (typeof riskScore === 'number') road.riskScore = riskScore;
  road.lastUpdated = new Date().toISOString();

  if (req.user) {
    logAudit(
      req.user,
      'ROAD_STATUS_CHANGE',
      `${road.id} (${road.name})`,
      `Changed road status from ${oldStatus} to ${status} (risk score: ${road.riskScore})`
    );
  }

  res.json({ success: true, updatedRoad: road });
});

app.get('/api/shelters', (req: Request, res: Response) => {
  res.json(currentShelters);
});

app.patch('/api/shelters/:id', authenticateToken, requireRoles(['EXPERT', 'ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { currentOccupancy, capacity } = req.body;
  const shelter = currentShelters.find(s => s.id === id);
  if (!shelter) {
    return res.status(404).json({ error: 'Shelter not found' });
  }
  if (typeof currentOccupancy === 'number') shelter.currentOccupancy = currentOccupancy;
  if (typeof capacity === 'number') shelter.capacity = capacity;
  shelter.lastUpdated = new Date().toISOString();

  if (req.user) {
    logAudit(req.user, 'SHELTER_UPDATE', `${shelter.id} (${shelter.name})`, `Occupancy updated to ${shelter.currentOccupancy}/${shelter.capacity}`);
  }

  res.json({ success: true, updatedShelter: shelter });
});

app.get('/api/hospitals', (req: Request, res: Response) => {
  res.json(INITIAL_HOSPITALS);
});

app.get('/api/emergency-facilities', (req: Request, res: Response) => {
  res.json(INITIAL_EMERGENCY_FACILITIES);
});

app.get('/api/reports', (req: Request, res: Response) => {
  res.json(currentReports);
});

// Citizen submits report (authenticated)
app.post('/api/reports', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { locationName, lat, lng, reportType, description, severity, roadId } = req.body;
  if (!locationName || !reportType || !severity) {
    return res.status(400).json({ error: 'Missing required report fields' });
  }

  const newReport: CommunityReport = {
    id: `REP_${Date.now()}`,
    userId: req.user?.id || 'anonymous',
    userName: req.user?.fullName || 'Citizen Reporter',
    roadId,
    locationName,
    lat: Number(lat) || 18.5204,
    lng: Number(lng) || 73.8567,
    reportType,
    description: description || 'Citizen reported water hazard',
    severity,
    timestamp: new Date().toISOString(),
    verificationStatus: 'Reported',
    confidenceScore: 0.70
  };

  currentReports.unshift(newReport);

  // If report indicates road blocked or critical flood, adjust road status cautiously
  if (roadId) {
    const targetRoad = currentRoadSegments.find(r => r.id === roadId);
    if (targetRoad && (severity === 'Critical' || reportType === 'Road blocked')) {
      targetRoad.status = 'caution';
      targetRoad.riskScore = Math.max(targetRoad.riskScore, 75);
    }
  }

  res.status(201).json({ success: true, report: newReport });
});

// Citizen "My Reports" view (Section 6)
app.get('/api/reports/my-reports', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const userReports = currentReports.filter(r => r.userId === req.user?.id);
  res.json(userReports);
});

// Verifying reports requires EXPERT or ADMIN authentication!
app.patch('/api/reports/:id/verify', authenticateToken, requireRoles(['EXPERT', 'ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { verificationStatus, officialAction } = req.body;
  const report = currentReports.find(r => r.id === id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const oldStatus = report.verificationStatus;
  report.verificationStatus = verificationStatus;
  report.reviewedBy = req.user?.fullName;

  if (verificationStatus === 'Verified') {
    report.confidenceScore = 0.95;
    // Official authority confirmation: If report was "Road blocked" or Critical, close the road
    if (report.roadId && (report.reportType === 'Road blocked' || officialAction === 'close_road')) {
      const road = currentRoadSegments.find(r => r.id === report.roadId);
      if (road) {
        road.status = 'blocked';
        road.riskScore = 100;
      }
    }
  } else if (verificationStatus === 'Rejected') {
    report.confidenceScore = 0.20;
  } else if (verificationStatus === 'Resolved') {
    report.resolvedAt = new Date().toISOString();
  }

  if (req.user) {
    logAudit(
      req.user,
      'INCIDENT_VERIFICATION',
      report.id,
      `Report status changed from ${oldStatus} to ${verificationStatus} for ${report.locationName}`
    );
  }

  res.json({ success: true, report });
});

app.get('/api/polls', (req: Request, res: Response) => {
  res.json(currentPolls);
});

app.post('/api/polls/:id/vote', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { option } = req.body;
  const poll = currentPolls.find(p => p.id === id);
  if (!poll) {
    return res.status(404).json({ error: 'Poll not found' });
  }
  if (!poll.options.includes(option)) {
    return res.status(400).json({ error: 'Invalid option selected' });
  }

  poll.votes[option] = (poll.votes[option] || 0) + 1;
  poll.totalVotes += 1;

  res.json({ success: true, poll, breakdown: calculatePollBreakdown(poll.votes) });
});

app.get('/api/routes/feedback', (req: Request, res: Response) => {
  res.json(currentRouteFeedback);
});

app.post('/api/routes/feedback', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { routeName, reachedSafely, routeCondition, waterLevelCategory, travelTimeMins, rating } = req.body;
  const feedback: RouteFeedback = {
    id: `FB_${Date.now()}`,
    userId: req.user?.id || 'anonymous',
    userName: req.user?.fullName || 'Citizen Traveler',
    routeName: routeName || 'Custom Route',
    reachedSafely: Boolean(reachedSafely),
    routeCondition: routeCondition || 'Normal',
    waterLevelCategory: waterLevelCategory || 'None',
    travelTimeMins: Number(travelTimeMins) || 15,
    rating: Number(rating) || 5,
    timestamp: new Date().toISOString()
  };
  currentRouteFeedback.unshift(feedback);
  res.status(201).json({ success: true, feedback });
});

app.post('/api/routes/find', (req: Request, res: Response) => {
  const { startNodeId, targetNodeId, lambdaRisk } = req.body;

  const graphEdges = currentRoadSegments.map(r => ({
    id: r.id,
    from: r.from,
    to: r.to,
    name: r.name,
    distanceKm: r.distanceKm,
    speedKmph: r.speedKmph,
    riskScore: r.riskScore,
    status: r.status,
    baseElevationM: r.baseElevationM
  }));

  const shortest = calculateDijkstraRoute(
    PUNE_ROAD_NODES,
    graphEdges,
    startNodeId,
    targetNodeId,
    'shortest',
    Number(lambdaRisk) || 1.5
  );

  const safest = calculateDijkstraRoute(
    PUNE_ROAD_NODES,
    graphEdges,
    startNodeId,
    targetNodeId,
    'safest',
    Number(lambdaRisk) || 1.5
  );

  res.json({
    startNode: PUNE_ROAD_NODES[startNodeId],
    targetNode: PUNE_ROAD_NODES[targetNodeId],
    shortestRoute: shortest,
    safestRoute: safest
  });
});

app.post('/api/risk/calculate', (req: Request, res: Response) => {
  const { rainfallMm, elevationM, slopePct, drainageCondition, hasHistoricalFlood, communityRiskScore } = req.body;
  const riskResult = calculateFloodRisk({
    rainfallMm: Number(rainfallMm) || 0,
    elevationM: Number(elevationM) || 560,
    slopePct: Number(slopePct) || 1.0,
    drainageCondition: drainageCondition || 'moderate',
    hasHistoricalFlood: Boolean(hasHistoricalFlood),
    communityRiskScore: Number(communityRiskScore) || 0
  });
  res.json(riskResult);
});

// AI Chatbot with verified Pune Flood Protocols and Gemini RAG fallback
app.post('/api/chatbot/message', async (req: Request, res: Response) => {
  const { message, lang = 'en' } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const normalized = message.toLowerCase();

  // Deterministic Verified Emergency Guidance (RAG)
  let staticAnswer = '';

  if (normalized.includes('sinhagad') || normalized.includes('anand nagar') || normalized.includes('सिंहगड')) {
    staticAnswer = 'Sinhagad Road along the Mutha River basin (Ekta Nagari / Anand Nagar) is currently under CRITICAL FLOOD RISK due to rising backwaters from Khadakwasla Dam discharge. Please avoid this stretch. Use the elevated Warje Bypass or Karve Road via Kothrud instead.';
  } else if (normalized.includes('shelter') || normalized.includes('आश्रय') || normalized.includes('मदत')) {
    staticAnswer = 'Verified high-ground shelters in Pune right now:\n1. Shivajinagar Relief Community Hall (Ghole Road) - Capacity: 250 (Pet friendly, Wheelchair accessible, Ph: +91-20-25501001)\n2. Kothrud Municipal Sports Complex (Chandani Chowk Road) - Capacity: 500 (Pet friendly, Ph: +91-20-25442010)\n3. Pimpri PCMC Disaster Shelter (Bhavan road) - Capacity: 450 (Ph: +91-20-27425555)';
  } else if (normalized.includes('animal') || normalized.includes('dog') || normalized.includes('pet') || normalized.includes('प्राणी') || normalized.includes('कुत्रा')) {
    staticAnswer = 'For animal rescue during floods:\n1. RESQ Charitable Trust (Bavdhan/Paud Rd): 24x7 helpline +91-9890999111 (handles pets, strays, cattle & wild animals)\n2. SPCA Pune Veterinary Hospital: +91-20-24440022\n3. Bodhisattva Animal Rescue (Kothrud): +91-9158000456.\nEnsure pets are unchained and kept with emergency dry food.';
  } else if (normalized.includes('sos') || normalized.includes('number') || normalized.includes('helpline') || normalized.includes('फोन') || normalized.includes('नंबर')) {
    staticAnswer = 'Emergency Pune Helplines:\n• PMC Disaster Control Room: +91-20-25501269\n• Fire Brigade: 101 / +91-20-26451707\n• NDRF Talegaon: 1070 / +91-20-24328888\n• Ambulance Service: 108\n• RESQ Animal Helpline: +91-9890999111';
  } else if (normalized.includes('fc road') || normalized.includes('fergusson')) {
    staticAnswer = 'FC Road currently has moderate water accumulation near the footpath drains, but remains passable with caution. JM Road is currently clearer with better drainage flow.';
  } else if (normalized.includes('what should i do') || normalized.includes('heavy rain') || normalized.includes('पाऊस')) {
    staticAnswer = 'Key Heavy Rain Precautions in Pune:\n1. Move to upper floors if near Mutha or Pavana riverbanks.\n2. Do NOT drive or walk into submerged underpasses (e.g. Sancheti or Shivajinagar subway).\n3. Keep mobile phones charged and flashlights ready.\n4. Check FloodGuard safe-route planner before travelling.';
  }

  if (aiClient) {
    try {
      const prompt = `You are FloodGuard AI, an emergency flood risk intelligence assistant for Pune & Pimpri-Chinchwad, Maharashtra.
Ground truth status:
- Mutha river discharge from Khadakwasla is heavy.
- Sinhagad Road is heavily waterlogged (risk 88/100, critical).
- FC Road is moderate (risk 42/100).
- JM Road is open (risk 28/100).
- Kothrud / Karve Road is elevated and safe (risk 18/100).
- Nearest shelters: Shivajinagar Community Hall (+91-20-25501001), Kothrud Sports Complex (+91-20-25442010).
- Animal rescue: RESQ Helpline +91-9890999111.
- Police & Fire: 100 / 101 / 108, PMC Disaster: +91-20-25501269.
Rules:
- Never claim a flooded route is 100% safe.
- Give concise, clear, actionable emergency instructions in ${lang === 'hi' ? 'Hindi' : (lang === 'mr' ? 'Marathi' : 'English')}.
User asks: "${message}"`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      if (response && response.text) {
        return res.json({
          reply: response.text,
          source: 'Gemini AI grounded with Pune Real-Time Flood Datasets',
          timestamp: new Date().toISOString()
        });
      }
    } catch (llmErr) {
      console.warn('Gemini call failed, falling back to static RAG:', llmErr);
    }
  }

  const finalReply = staticAnswer || (
    lang === 'mr'
      ? 'फ्लडगार्ड आपत्कालीन प्रणाली: कृपया सावध राहा. पुराच्या पाण्याचा अंदाज येत नसल्यास सुरक्षित उंचावरील ठिकाणी आसरा घ्या. आपत्ती नियंत्रण कक्ष: +91-20-25501269.'
      : (lang === 'hi'
        ? 'फ्लडगार्ड आपातकालीन प्रणाली: कृपया सुरक्षित रहें। यदि सड़क पर पानी भरा है तो जोखिम न लें। पुणे आपदा नियंत्रण कक्ष: +91-20-25501269.'
        : 'FloodGuard Emergency System: Please exercise caution. If streets are submerged, seek high ground immediately. Never drive through moving floodwater. For PMC Disaster Management call +91-20-25501269 or Fire Brigade 101.')
  );

  res.json({
    reply: finalReply,
    source: 'FloodGuard Verified Offline RAG Knowledge Base',
    timestamp: new Date().toISOString()
  });
});

// Mount Vite middleware in development
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FloodGuard Secure Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
