export type Language = 'en' | 'hi' | 'mr';

export type UserRole = 'CITIZEN' | 'AUTHORITY_ADMIN' | 'EXPERT';
export type AccountStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED' | 'SUSPENDED';
export type AuthorityPermission =
  | 'REPORTS_VIEW'
  | 'REPORTS_VERIFY'
  | 'ROAD_STATUS_UPDATE'
  | 'HAZARD_VERIFY'
  | 'SHELTER_MANAGE'
  | 'ALERT_CREATE'
  | 'EXPERT_MANAGE'
  | 'AUDIT_VIEW';

export interface AuthorityMembership {
  id: string;
  authorityId: string;
  authorityName: string;
  authorityRegion: string;
  role: 'AUTHORITY_ADMIN' | 'EXPERT';
  status: 'INVITED' | 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  permissions: AuthorityPermission[];
}

export type RoadStatus =
  | 'OPEN'
  | 'REPORTED_WATERLOGGING'
  | 'VERIFIED_HAZARD'
  | 'CLOSED'
  | 'UNKNOWN';

export type RiskCategory = 'Low' | 'Moderate' | 'High' | 'Severe' | 'Unknown';

export type DataFreshness = 'LIVE' | 'MODEL_ESTIMATE' | 'OBSERVED_RECENT' | 'FORECAST' | 'DELAYED' | 'HISTORICAL' | 'UNAVAILABLE';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  role: UserRole;
  accountStatus: AccountStatus;
  organisation?: string;
  designation?: string;
  createdAt: string;
  preferredLanguage?: Language;
  authorityMembership?: AuthorityMembership;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  message?: string;
}

export interface ExpertApplication {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  organisation: string;
  designation: string;
  status: AccountStatus;
  appliedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  authorityId?: string;
  reviewedById?: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetResource: string;
  details: string;
  timestamp: string;
  authorityId?: string;
}

export interface OsmSyncLog {
  syncId: string;
  syncType: 'AUTOMATIC' | 'MANUAL';
  status: 'SUCCESS' | 'FAILED' | 'VALIDATION_REJECTED';
  nodesCount: number;
  edgesCount: number;
  roadsPreserved: number;
  roadsAdded: number;
  durationMs: number;
  errorMessage?: string | null;
  detailsJson?: string | null;
  createdAt: string;
  syncTimestamp?: string;
  source?: string;
}

export interface OsmRoadMapping {
  osmWayId: number;
  segmentIndex: number;
  mappedRoadId: string;
  fromNode: string;
  toNode: string;
  confidence: number;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId?: string; // null/undefined = broadcast to all citizens
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  relatedRoadId?: string;
  relatedReportId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface ExpertAlert extends AppNotification {
  createdById: string;
  createdBy: string;
  deliveryStatus: 'NOT_CONFIGURED';
}

export interface EvacuationPreferences {
  hasChildren: boolean;
  hasElderly: boolean;
  hasMobilityRequirements: boolean;
  hasPets: boolean;
}

export interface RoadNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  elevationM: number | null;
  sector?: string;
}

export interface RoadSegment {
  id: string;
  authorityId?: string;
  name: string;
  from: string;
  to: string;
  distanceKm: number;
  speedKmph: number;
  roadType: 'trunk' | 'primary' | 'secondary' | 'tertiary';
  baseElevationM: number | null;
  slopePct: number | null;
  drainageCondition: 'good' | 'moderate' | 'poor' | 'clogged' | 'unknown';
  isOneWay: boolean;
  accessRestriction: 'all_vehicles' | 'no_heavy_vehicles' | 'emergency_only';
  isBridge?: boolean;
  isTunnel?: boolean;
  surface?: string;
  hasHistoricalFlood: boolean;
  waterwayProximity?: string | null;
  riskScore: number | null; // 0-100 or null when unknown
  riskCategory: RiskCategory;
  confidenceScore: number; // 0-1 completeness/confidence
  status: RoadStatus;
  coordinates: [number, number][]; // [lat, lng][] for Leaflet polyline
  geometrySource?: string;
  riskSources?: string[];
  riskExplanation?: string;
  riskObservationTimestamp?: string;
  riskUpdatedAt?: string;
  lastUpdated?: string;
  verifiedBy?: string;
  statusReason?: string;
  expiresAt?: string | null;
}

export interface Shelter {
  id: string;
  authorityId?: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  currentOccupancy: number;
  petFriendly: boolean;
  wheelchairAccessible: boolean;
  contact: string;
  address: string;
  lastUpdated: string;
}

export interface Hospital {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  contact: string;
  totalBeds: number;
  availableIcu: number;
  hasTraumaCenter: boolean;
}

export interface EmergencyFacility {
  id: string;
  name: string;
  aliases?: string[];
  type: string;
  lat?: number;
  lng?: number;
  contact: string;
  specialization: string;
  serviceHours: string;
}

export interface CommunityReport {
  id: string;
  userId: string;
  userName?: string;
  roadId?: string;
  locationName: string;
  lat: number;
  lng: number;
  reportType:
    | 'Waterlogging'
    | 'Road flooded'
    | 'Road blocked'
    | 'Heavy rainfall'
    | 'Drainage overflow'
    | 'Fallen tree'
    | 'Traffic disruption'
    | 'Rescue required';
  description: string;
  severity: 'Low' | 'Moderate' | 'High' | 'Critical';
  timestamp: string;
  verificationStatus: 'Reported' | 'Under Review' | 'Verified' | 'Rejected' | 'Resolved';
  confidenceScore: number;
  imageUrl?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  reviewedAt?: string;
  resolvedAt?: string;
}

export interface RouteFeedback {
  id: string;
  userId: string;
  userName?: string;
  routeName: string;
  reachedSafely: boolean;
  routeCondition: string;
  waterLevelCategory: string;
  travelTimeMins: number;
  rating: number; // 1-5
  timestamp: string;
}

export interface LivePoll {
  id: string;
  roadId: string;
  roadName: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  totalVotes: number;
  userVotedOption?: string;
  isActive: boolean;
}

export interface RainfallObservation {
  stationId: string;
  stationName: string;
  lat: number;
  lng: number;
  observedPast24hMm: number | null;
  currentHourMm: number | null;
  forecastNext24hMm: number | null;
  durationHrs: number;
  source: string;
  resolution: string;
  dataType: DataFreshness;
  timestamp: string;
  isAvailable: boolean;
}

export interface RainfallFeedMetadata {
  lastSuccessfulUpdate: string | null;
  openMeteoStatus: 'OK' | 'UNAVAILABLE';
  imdApiStatus: 'CONFIGURED' | 'KEY_MISSING' | 'UNAVAILABLE';
  imdNote: string;
  observations: RainfallObservation[];
}

export interface TrafficFeedStatus {
  provider: string;
  isLiveActive: boolean;
  lastChecked: string | null;
  lastSuccessfulUpdate?: string | null;
  liveSegments?: number;
  cachedSegments?: number;
  coverageSector: string;
  message: string;
}

export interface HistoricalFlood {
  id: string;
  name: string;
  lat: number;
  lng: number;
  date: string;
  severity: string;
  waterLevelM: number;
  roadAffected: string;
  source: string;
}

export interface WaterwayFeature {
  id: string;
  name: string;
  waterwayType: 'river' | 'stream' | 'canal' | 'drain' | 'culvert';
  sector: string;
  lat: number;
  lng: number;
  capacityKnown: boolean;
  reportedCapacityCusecs: number | null;
  maintenanceNote: string;
  source: string;
}
