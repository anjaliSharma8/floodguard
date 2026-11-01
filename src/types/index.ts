export type Language = 'en' | 'hi' | 'mr';

export type UserRole = 'CITIZEN' | 'EXPERT' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED' | 'SUSPENDED';

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
  elevationM: number;
}

export interface RoadSegment {
  id: string;
  name: string;
  from: string;
  to: string;
  distanceKm: number;
  speedKmph: number;
  roadType: 'primary' | 'secondary' | 'trunk';
  baseElevationM: number;
  slopePct: number;
  drainageCondition: 'good' | 'moderate' | 'poor' | 'clogged';
  riskScore: number; // 0-100
  status: 'open' | 'caution' | 'blocked' | 'critical_waterlogged';
  coordinates: [number, number][]; // [lat, lng][] for Leaflet polyline
  lastUpdated?: string;
}

export interface Shelter {
  id: string;
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
  type: 'Disaster Control' | 'Fire & Rescue' | 'NDRF Post' | 'Animal Rescue' | 'Veterinary';
  lat: number;
  lng: number;
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
  reportType: 'Waterlogging' | 'Road flooded' | 'Road blocked' | 'Heavy rainfall' | 'Drainage overflow' | 'Fallen tree' | 'Traffic disruption' | 'Rescue required';
  description: string;
  severity: 'Low' | 'Moderate' | 'High' | 'Critical';
  timestamp: string;
  verificationStatus: 'Reported' | 'Under Review' | 'Verified' | 'Rejected' | 'Resolved';
  confidenceScore: number;
  imageUrl?: string;
  reviewedBy?: string;
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
  rainfallMm: number;
  durationHrs: number;
  source: string;
  timestamp: string;
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
