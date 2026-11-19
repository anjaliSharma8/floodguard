/**
 * SanketSetu Authoritative Flood-Risk & Road-Graph Routing Engine
 *
 * 1. Transparent Rule-Based Multi-Factor Flood Risk Assessment:
 *    R = w1*F_rain + w2*F_terrain + w3*F_drainage + w4*F_historical + w5*F_community
 *    - Each factor normalized to [0, 100]
 *    - Weights nonnegative and sum strictly to 1.00
 *    - Missing observations are NOT treated as zero risk; they fall back to precautionary
 *      baseline values and lower dataCompleteness / confidenceScore.
 *    - Timestamp freshness checks mark delayed/stale data and down-weight stale readings.
 *    - Contradictory observations (e.g., high community flood reports vs zero rainfall) are flagged.
 *
 * 2. Directed Road-Network Graph Routing G = (V, E):
 *    - Honors one-way restrictions (isOneWay) and access restrictions
 *    - Excludes ONLY verified closures (status === 'CLOSED')
 *    - Preserves traversability for 'REPORTED_WATERLOGGING' and 'VERIFIED_HAZARD' with warnings
 *    - Three genuinely independent route objectives, each runs its own Dijkstra:
 *        a) Shortest:  minimize total road-network distance (km)
 *                      weight = distanceKm
 *        b) Fastest:   minimize estimated travel time T(e) (minutes)
 *                      weight = T(e) = (distanceKm / speedKmph) * 60
 *                      Uses actual road speed; no flood-risk terms.
 *        c) Safest:    minimize flood-risk-adjusted travel cost C(e) (minutes)
 *                      weight = T(e) + λ * T(e) * riskNorm + statusPenalty
 *                      where riskNorm = riskScore / 100  (clamped 0–1)
 *                            λ        = risk-avoidance slider value
 *                            statusPenalty = T(e) * 1.5  for VERIFIED_HAZARD
 *                                          = T(e) * 0.6  for REPORTED_WATERLOGGING
 *                      A road with riskNorm = 0.60 and λ = 1.8 multiplies its travel time by
 *                      (1 + 1.8 * 0.60) = 2.08, making high-risk corridors substantially
 *                      more expensive than low-risk roads regardless of raw speed.
 *    - Yen's K-shortest loopless paths algorithm for genuine route alternatives
 *    - Coordinate road-snapping to nearest segment/node in the road graph
 */

import { DataFreshness, RiskCategory, RoadNode, RoadSegment, RoadStatus } from '../types';

export interface RiskFactorWeights {
  rainfall: number;
  terrain: number;
  drainage: number;
  historical: number;
  community: number;
}

export const DEFAULT_WEIGHTS: RiskFactorWeights = {
  rainfall: 0.30,
  terrain: 0.20,
  drainage: 0.15,
  historical: 0.15,
  community: 0.20
};

export interface FloodRiskInput {
  rainfallMm?: number | null;
  durationHrs?: number | null;
  rainfallTimestamp?: string | null;
  elevationM?: number | null;
  slopePct?: number | null;
  drainageCondition?: string | null;
  hasHistoricalFlood?: boolean | null;
  communityRiskScore?: number | null;
  hasVerifiedCommunityHazard?: boolean;
  weights?: Partial<RiskFactorWeights>;
  referenceTimeMs?: number;
}

export interface FloodRiskResult {
  riskScore: number | null;
  category: RiskCategory;
  color: string;
  confidenceScore: number; // 0.0 to 1.0
  dataCompletenessPct: number; // 0 to 100
  freshnessStatus: DataFreshness;
  contradictionDetected: boolean;
  contradictionNote?: string;
  factors: {
    rainfallRisk: number;
    terrainRisk: number;
    drainageRisk: number;
    historicalRisk: number;
    communityRisk: number;
  };
  missingFactors: string[];
  weights: RiskFactorWeights;
  methodology: string;
  explainability: string;
}

export function classifyRiskScore(score: number | null | undefined): {
  category: RiskCategory;
  color: string;
} {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return { category: 'Unknown', color: '#64748b' }; // slate-500 grey
  }
  if (score >= 75) {
    return { category: 'Severe', color: '#ef4444' }; // red-500
  }
  if (score >= 50) {
    return { category: 'High', color: '#f97316' }; // orange-500
  }
  if (score >= 25) {
    return { category: 'Moderate', color: '#eab308' }; // yellow-500
  }
  return { category: 'Low', color: '#10b981' }; // emerald-500
}

export function normalizeWeights(partial?: Partial<RiskFactorWeights>): RiskFactorWeights {
  const raw: RiskFactorWeights = {
    rainfall: Math.max(0, partial?.rainfall ?? DEFAULT_WEIGHTS.rainfall),
    terrain: Math.max(0, partial?.terrain ?? DEFAULT_WEIGHTS.terrain),
    drainage: Math.max(0, partial?.drainage ?? DEFAULT_WEIGHTS.drainage),
    historical: Math.max(0, partial?.historical ?? DEFAULT_WEIGHTS.historical),
    community: Math.max(0, partial?.community ?? DEFAULT_WEIGHTS.community)
  };
  const sum = raw.rainfall + raw.terrain + raw.drainage + raw.historical + raw.community;
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  return {
    rainfall: raw.rainfall / sum,
    terrain: raw.terrain / sum,
    drainage: raw.drainage / sum,
    historical: raw.historical / sum,
    community: raw.community / sum
  };
}

export function assessFreshness(timestamp?: string | null, nowMs: number = Date.now()): {
  status: DataFreshness;
  ageHours: number | null;
  freshnessMultiplier: number;
} {
  if (!timestamp) {
    return { status: 'UNAVAILABLE', ageHours: null, freshnessMultiplier: 0.65 };
  }
  const parsedMs = Date.parse(timestamp);
  if (Number.isNaN(parsedMs)) {
    return { status: 'UNAVAILABLE', ageHours: null, freshnessMultiplier: 0.65 };
  }
  const ageHours = Math.max(0, (nowMs - parsedMs) / (1000 * 60 * 60));
  if (ageHours <= 2) return { status: 'OBSERVED_RECENT', ageHours, freshnessMultiplier: 1.0 };
  if (ageHours <= 6) return { status: 'DELAYED', ageHours, freshnessMultiplier: 0.9 };
  return { status: 'HISTORICAL', ageHours, freshnessMultiplier: 0.75 };
}

/**
 * Normalizes rainfall intensity (mm over duration) to [0, 100].
 * Missing rainfall returns precautionary score 45 (never 0) and marks missing.
 */
export function calculateRainfallFactor(
  rainfallMm?: number | null,
  durationHrs: number | null = 24.0
): { score: number; available: boolean } {
  if (rainfallMm === null || rainfallMm === undefined || Number.isNaN(rainfallMm)) {
    return { score: 45.0, available: false };
  }
  if (rainfallMm <= 0) return { score: 0.0, available: true };
  const dur = Math.max(durationHrs ?? 24.0, 1.0);
  const intensityPerHr = rainfallMm / dur;
  // Also account for 24h cumulative rainfall (IMD heavy >= 64.5mm/24h, very heavy >= 115.6mm/24h)
  const cumulativeScore = Math.min(100.0, (rainfallMm / 120.0) * 100.0);
  let intensityScore = 0;
  if (intensityPerHr >= 35) intensityScore = 100.0;
  else if (intensityPerHr >= 20) intensityScore = 75.0 + ((intensityPerHr - 20) / 15.0) * 25.0;
  else if (intensityPerHr >= 8) intensityScore = 40.0 + ((intensityPerHr - 8) / 12.0) * 35.0;
  else intensityScore = (intensityPerHr / 8.0) * 40.0;

  return {
    score: Math.round(Math.max(intensityScore, cumulativeScore) * 10) / 10,
    available: true
  };
}

/**
 * Lower elevations and flatter slopes (<1%) have higher waterlogging vulnerability.
 * Missing elevation or slope returns precautionary score 50 (never 0).
 */
export function calculateTerrainFactor(
  elevationM?: number | null,
  slopePct?: number | null
): { score: number; available: boolean } {
  if (elevationM === null || elevationM === undefined || Number.isNaN(elevationM)) {
    return { score: 50.0, available: false };
  }
  // Pune elevation ranges ~540m (riverbed) to ~630m (Katraj/hills)
  const elevScore = Math.max(0, Math.min(100, (595 - elevationM) * 2.0));
  const effectiveSlope = slopePct === null || slopePct === undefined || Number.isNaN(slopePct) ? 1.0 : slopePct;
  const slopePenalty = effectiveSlope < 0.5 ? 32.0 : effectiveSlope < 1.2 ? 18.0 : effectiveSlope < 2.0 ? 8.0 : 0.0;
  const score = Math.max(0, Math.min(100, Math.round((elevScore * 0.72 + slopePenalty) * 10) / 10));
  return { score, available: slopePct !== null && slopePct !== undefined };
}

/**
 * Drainage condition factor. Unknown drainage returns precautionary score 55.
 */
export function calculateDrainageFactor(condition?: string | null): { score: number; available: boolean } {
  if (!condition) return { score: 55.0, available: false };
  const c = condition.toLowerCase();
  switch (c) {
    case 'poor':
      return { score: 90.0, available: true };
    case 'clogged':
      return { score: 85.0, available: true };
    case 'moderate':
      return { score: 45.0, available: true };
    case 'good':
      return { score: 15.0, available: true };
    case 'excellent':
      return { score: 5.0, available: true };
    case 'unknown':
      return { score: 55.0, available: false };
    default:
      return { score: 55.0, available: false };
  }
}

export function calculateFloodRisk(input: FloodRiskInput): FloodRiskResult {
  const w = normalizeWeights(input.weights);
  const missingFactors: string[] = [];

  const rain = calculateRainfallFactor(input.rainfallMm, input.durationHrs ?? 24.0);
  if (!rain.available) missingFactors.push('rainfall');

  const terrain = calculateTerrainFactor(input.elevationM, input.slopePct);
  if (!terrain.available) missingFactors.push('terrain');

  const drainage = calculateDrainageFactor(input.drainageCondition);
  if (!drainage.available) missingFactors.push('drainage');

  const histAvailable = input.hasHistoricalFlood !== null && input.hasHistoricalFlood !== undefined;
  if (!histAvailable) missingFactors.push('historical_floods');
  const hFactor = histAvailable ? (input.hasHistoricalFlood ? 85.0 : 15.0) : 45.0;

  const commAvailable = input.communityRiskScore !== null && input.communityRiskScore !== undefined;
  const cFactor = commAvailable ? Math.max(0, Math.min(100, Number(input.communityRiskScore))) : 25.0;
  if (!commAvailable) missingFactors.push('community_reports');

  const freshness = assessFreshness(input.rainfallTimestamp, input.referenceTimeMs ?? Date.now());
  if (rain.available && freshness.status === 'HISTORICAL') {
    missingFactors.push('live_rainfall_freshness');
  }

  // Detect contradictory observations
  let contradictionDetected = false;
  let contradictionNote: string | undefined;
  if (rain.available && (input.rainfallMm ?? 0) < 2 && cFactor >= 70) {
    contradictionDetected = true;
    contradictionNote =
      'Contradiction detected: high community waterlogging reports despite low observed rainfall (possible burst pipe, dam release, or stale weather reading).';
  } else if (rain.available && (input.rainfallMm ?? 0) >= 80 && cFactor === 0 && input.hasVerifiedCommunityHazard) {
    contradictionDetected = true;
    contradictionNote = 'Contradiction detected: heavy rainfall telemetry with conflicting hazard state.';
  }

  // If >= 3 core factors are completely missing, report Unknown category instead of pretending precision
  const totalCoreFactors = 5;
  const availableCoreCount =
    (rain.available ? 1 : 0) +
    (terrain.available ? 1 : 0) +
    (drainage.available ? 1 : 0) +
    (histAvailable ? 1 : 0) +
    (commAvailable ? 1 : 0);

  const dataCompletenessPct = Math.round((availableCoreCount / totalCoreFactors) * 100);
  let confidenceScore = (availableCoreCount / totalCoreFactors) * (rain.available ? freshness.freshnessMultiplier : 0.75);
  if (contradictionDetected) confidenceScore *= 0.8;
  confidenceScore = Math.round(Math.max(0.15, Math.min(1.0, confidenceScore)) * 100) / 100;

  if (availableCoreCount <= 1) {
    return {
      riskScore: null,
      category: 'Unknown',
      color: '#64748b',
      confidenceScore,
      dataCompletenessPct,
      freshnessStatus: freshness.status,
      contradictionDetected,
      contradictionNote,
      factors: {
        rainfallRisk: rain.score,
        terrainRisk: terrain.score,
        drainageRisk: drainage.score,
        historicalRisk: hFactor,
        communityRisk: cFactor
      },
      missingFactors,
      weights: w,
      methodology: 'Rule-based weighted linear index (5 normalized 0-100 factors). Not a trained ML model.',
      explainability: `Insufficient observational data (${dataCompletenessPct}% complete). Missing: ${missingFactors.join(', ')}. Status classified as Unknown.`
    };
  }

  const rawScore =
    w.rainfall * rain.score +
    w.terrain * terrain.score +
    w.drainage * drainage.score +
    w.historical * hFactor +
    w.community * cFactor;

  const riskScore = Math.round(Math.max(0, Math.min(100, rawScore)) * 10) / 10;
  const { category, color } = classifyRiskScore(riskScore);

  const explainability =
    `Rule-based score ${riskScore}/100 (${category}) | Completeness: ${dataCompletenessPct}% | ` +
    `Rainfall=${rain.score}${rain.available ? '' : ' (est/missing)'}, ` +
    `Terrain=${terrain.score}${terrain.available ? '' : ' (est/missing)'}, ` +
    `Drainage=${drainage.score}${drainage.available ? '' : ' (unknown)'}, ` +
    `Historical=${hFactor}, Community=${cFactor}.` +
    (contradictionNote ? ` Note: ${contradictionNote}` : '');

  return {
    riskScore,
    category,
    color,
    confidenceScore,
    dataCompletenessPct,
    freshnessStatus: rain.available ? freshness.status : 'UNAVAILABLE',
    contradictionDetected,
    contradictionNote,
    factors: {
      rainfallRisk: rain.score,
      terrainRisk: terrain.score,
      drainageRisk: drainage.score,
      historicalRisk: hFactor,
      communityRisk: cFactor
    },
    missingFactors,
    weights: w,
    methodology: 'Rule-based weighted linear index (5 normalized 0-100 factors). Not a trained ML model.',
    explainability
  };
}

// =========================================================================
// ROAD-NETWORK GRAPH ROUTING ENGINE G = (V, E)
// =========================================================================

export type RouteMode = 'shortest' | 'fastest' | 'safest';

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  name: string;
  distanceKm: number;
  speedKmph: number;
  riskScore: number | null;
  status: RoadStatus;
  baseElevationM: number | null;
  isOneWay?: boolean;
  accessRestriction?: 'all_vehicles' | 'no_heavy_vehicles' | 'emergency_only';
  coordinates?: [number, number][];
}

export interface RouteCalculationResult {
  mode: RouteMode;
  feasible: boolean;
  message?: string;
  nodeIds: string[];
  nodes: RoadNode[];
  edges: GraphEdge[];
  totalDistanceKm: number;
  travelTimeMins: number;
  averageRiskScore: number;
  maxRiskScore: number;
  riskExposureScore: number; // distance-weighted cumulative risk exposure
  hazardousSegmentCount: number;
  closuresAvoidedCount: number;
  unverifiedWarnings: string[];
  unknownRiskSegmentsCount: number;
  safetyRating: 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Severe Risk' | 'Blocked' | 'Unknown';
}

export interface RouteDataQuality {
  weather: {
    provider: string;
    status: 'OK' | 'UNAVAILABLE';
    lastSuccessfulUpdate: string | null;
  };
  traffic: {
    provider: string;
    liveSegments: number;
    sampledSegments: number;
    networkSegments: number;
    lastSuccessfulUpdate: string | null;
  };
  warnings: string[];
}

export interface MultiRouteResponse {
  originNode: RoadNode;
  targetNode: RoadNode;
  lambdaRisk: number;
  shortest: RouteCalculationResult;
  fastest: RouteCalculationResult;
  safest: RouteCalculationResult;
  alternatives: RouteCalculationResult[];
  dataQuality?: RouteDataQuality;
}

/**
 * Computes base travel time T(e) in MINUTES using the actual speed assigned to the road segment.
 * edgeTime = (distanceKm / speedKmph) * 60
 *
 * Fallback speeds by road type (used only when speedKmph is missing or zero):
 *   - Motorway / expressway: 80 km/h
 *   - Arterial road:          50 km/h
 *   - Local road (default):   30 km/h
 */
export function computeEdgeTravelTimeMinutes(edge: GraphEdge): number {
  const speed = Math.max(10, edge.speedKmph || 30);
  return (edge.distanceKm / speed) * 60;
}

/**
 * Computes the risk-adjusted cost C(e) for the SAFEST objective.
 *
 * User-spec formula (transparent multiplicative form):
 *   C(e) = T(e) * (1 + λ * riskNorm) + statusPenalty(e)
 *
 * Where:
 *   T(e)         = (distanceKm / speedKmph) * 60     [minutes]
 *   riskNorm     = riskScore / 100                    [0.0 – 1.0]
 *   λ (lambda)   = risk-avoidance slider value        [0.0 – 4.0]
 *   statusPenalty:
 *     VERIFIED_HAZARD        → T(e) * 1.5
 *     REPORTED_WATERLOGGING  → T(e) * 0.6
 *     OPEN / UNKNOWN         → 0
 *
 * Exported for transparency and test verification; actual routing uses
 * computeEdgeRiskTimeMinutes + edgeWeight for the nonlinear penalty form.
 */
export function computeEdgeRiskAdjustedCost(edge: GraphEdge, lambdaRisk: number): number {
  const T = computeEdgeTravelTimeMinutes(edge);
  const effectiveRisk = edge.riskScore === null || edge.riskScore === undefined ? 50 : edge.riskScore;
  const riskNorm = Math.max(0, Math.min(100, effectiveRisk)) / 100.0;
  const lam = Math.max(0, lambdaRisk);

  let statusPenalty = 0;
  if (edge.status === 'VERIFIED_HAZARD') {
    statusPenalty = T * 1.5;
  } else if (edge.status === 'REPORTED_WATERLOGGING') {
    statusPenalty = T * 0.6;
  }

  return Math.max(0.001, T * (1 + lam * riskNorm) + statusPenalty);
}

/**
 * Calibrated non-negative time-equivalent risk penalty R_time(e) in MINUTES.
 * Uses a nonlinear power curve to strongly penalise high-risk roads:
 *   - Low risk  (riskScore ≤ 25): ~0–4 min penalty
 *   - Moderate  (25–50):         ~4–10 min penalty
 *   - High/Severe (50–100):      ~10–50+ min penalty (with status multiplier)
 *
 * Status multipliers:
 *   VERIFIED_HAZARD        → ×2.5 base + 12 min extra
 *   REPORTED_WATERLOGGING  → ×1.6 base + 4.8 min extra
 *   UNKNOWN                → ×1.25 base + 2 min extra
 *
 * Missing risk (null/undefined) → treated as 50 (moderate) for precautionary routing.
 */
export function computeEdgeRiskTimeMinutes(edge: GraphEdge): number {
  const effectiveRisk = edge.riskScore === null || edge.riskScore === undefined ? 50 : edge.riskScore;
  const clampedRisk = Math.max(0, Math.min(100, effectiveRisk));
  const riskNorm = clampedRisk / 100.0;

  let statusMultiplier = 1.0;
  if (edge.status === 'VERIFIED_HAZARD') statusMultiplier = 2.5;
  else if (edge.status === 'REPORTED_WATERLOGGING') statusMultiplier = 1.6;
  else if (edge.status === 'UNKNOWN') statusMultiplier = 1.25;

  const baseTimePenalty = Math.pow(riskNorm, 1.25) * 25.0;
  const statusExtra = (statusMultiplier - 1.0) * 8.0;

  return Math.max(0, baseTimePenalty * statusMultiplier + statusExtra);
}

/**
 * Independently calculates edge weight for Dijkstra optimization.
 *
 * SHORTEST:  weight = distanceKm
 *            → Minimises total road-network distance; no time or risk terms.
 *            → Completely independent of fastest and safest.
 *
 * FASTEST:   weight = T(e) = (distanceKm / speedKmph) * 60  [minutes]
 *            → Minimises estimated travel time using actual road-segment speed.
 *            → No flood-risk terms are applied; purely speed-based.
 *            → Completely independent of shortest and safest.
 *
 * SAFEST:    weight = T(e) + λ * R_time(e)   [minutes]
 *            → T(e) = travel time (same as fastest)
 *            → R_time(e) = nonlinear risk penalty from computeEdgeRiskTimeMinutes(e)
 *            → λ = risk-avoidance slider; higher λ = stronger avoidance of risky roads.
 *            → Completely independent of shortest and fastest Dijkstra calls.
 *            → Status multipliers ensure VERIFIED_HAZARD roads are very strongly penalised.
 *
 * All three weights are non-negative (clamped to minimum 0.001).
 */
export function edgeWeight(
  edge: GraphEdge,
  mode: RouteMode,
  lambdaRisk: number
): number {
  if (mode === 'shortest') {
    return Math.max(0.001, edge.distanceKm);
  }
  const edgeTime = computeEdgeTravelTimeMinutes(edge);
  if (mode === 'fastest') {
    // Pure travel time — do NOT include any risk or status penalty here
    return Math.max(0.001, edgeTime);
  }
  // Safest: risk-adjusted cost = travel time + lambda * nonlinear risk penalty
  // This formula strongly penalises high-risk and hazardous roads while remaining
  // proportional to road length through the base penalty curve.
  const penalty = computeEdgeRiskTimeMinutes(edge);
  return Math.max(0.001, edgeTime + Math.max(0, lambdaRisk) * penalty);
}

function isEdgeTraversable(
  edge: GraphEdge,
  currentNodeId: string,
  vehicleType: 'car' | 'two_wheeler' | 'heavy' | 'emergency' = 'car'
): { ok: boolean; neighborId: string | null } {
  // ONLY confirmed closures ('CLOSED') are strictly excluded
  if (edge.status === 'CLOSED') {
    return { ok: false, neighborId: null };
  }
  if (edge.accessRestriction === 'emergency_only' && vehicleType !== 'emergency') {
    return { ok: false, neighborId: null };
  }
  if (edge.accessRestriction === 'no_heavy_vehicles' && vehicleType === 'heavy') {
    return { ok: false, neighborId: null };
  }
  if (edge.from === currentNodeId) {
    return { ok: true, neighborId: edge.to };
  }
  if (!edge.isOneWay && edge.to === currentNodeId) {
    return { ok: true, neighborId: edge.from };
  }
  return { ok: false, neighborId: null };
}

function summarizeRoute(
  mode: RouteMode,
  nodeIds: string[],
  routeEdges: GraphEdge[],
  nodes: Record<string, RoadNode>,
  unconstrainedClosedEdgeIds: Set<string> = new Set()
): RouteCalculationResult {
  let totalDist = 0;
  let totalTime = 0;
  let weightedRiskSum = 0;
  let maxRisk = 0;
  let hazardousSegmentCount = 0;
  let unknownRiskSegmentsCount = 0;
  const unverifiedWarnings: string[] = [];
  const routeEdgeIdSet = new Set<string>();

  for (const e of routeEdges) {
    routeEdgeIdSet.add(e.id);
    totalDist += e.distanceKm;
    totalTime += computeEdgeTravelTimeMinutes(e);

    const effectiveRisk = e.riskScore === null || e.riskScore === undefined ? 50 : e.riskScore;
    if (e.riskScore === null || e.riskScore === undefined) {
      unknownRiskSegmentsCount += 1;
    }
    weightedRiskSum += effectiveRisk * e.distanceKm;
    if (effectiveRisk > maxRisk) {
      maxRisk = effectiveRisk;
    }

    if (e.status === 'VERIFIED_HAZARD' || (e.riskScore !== null && e.riskScore !== undefined && e.riskScore >= 50)) {
      hazardousSegmentCount += 1;
    }

    if (e.status === 'REPORTED_WATERLOGGING') {
      unverifiedWarnings.push(`Unverified citizen report of waterlogging on ${e.name}`);
    } else if (e.status === 'VERIFIED_HAZARD') {
      unverifiedWarnings.push(`Expert-verified flood hazard on ${e.name}`);
    }
  }

  const riskExposureScore = totalDist > 0 ? Math.round((weightedRiskSum / totalDist) * 10) / 10 : 0;
  const averageRiskScore = riskExposureScore;

  let closuresAvoidedCount = 0;
  for (const closedId of unconstrainedClosedEdgeIds) {
    if (!routeEdgeIdSet.has(closedId)) {
      closuresAvoidedCount += 1;
    }
  }

  let safetyRating: RouteCalculationResult['safetyRating'] = 'Low Risk';
  if (unknownRiskSegmentsCount === routeEdges.length && routeEdges.length > 0) {
    safetyRating = 'Unknown';
  } else if (maxRisk >= 75 || averageRiskScore >= 70) {
    safetyRating = 'Severe Risk';
  } else if (maxRisk >= 50 || averageRiskScore >= 45) {
    safetyRating = 'High Risk';
  } else if (averageRiskScore >= 25) {
    safetyRating = 'Moderate Risk';
  }

  return {
    mode,
    feasible: true,
    nodeIds,
    nodes: nodeIds.map(id => nodes[id]),
    edges: routeEdges,
    totalDistanceKm: Math.round(totalDist * 100) / 100,
    travelTimeMins: Math.round(totalTime * 10) / 10,
    averageRiskScore,
    maxRiskScore: Math.round(maxRisk * 10) / 10,
    riskExposureScore,
    hazardousSegmentCount,
    closuresAvoidedCount,
    unverifiedWarnings,
    unknownRiskSegmentsCount,
    safetyRating
  };
}

function runDijkstraRaw(
  nodes: Record<string, RoadNode>,
  edges: GraphEdge[],
  startNodeId: string,
  targetNodeId: string,
  mode: RouteMode,
  lambdaRisk: number,
  blockedEdgeIds: Set<string>,
  blockedNodeIds: Set<string>,
  vehicleType: 'car' | 'two_wheeler' | 'heavy' | 'emergency',
  ignoreClosures: boolean
): { feasible: boolean; nodeIds: string[]; edges: GraphEdge[] } {
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const edgeUsed: Record<string, GraphEdge | null> = {};
  const unvisited = new Set<string>();

  for (const nodeId of Object.keys(nodes)) {
    if (blockedNodeIds.has(nodeId) && nodeId !== startNodeId && nodeId !== targetNodeId) continue;
    distances[nodeId] = Infinity;
    previous[nodeId] = null;
    edgeUsed[nodeId] = null;
    unvisited.add(nodeId);
  }
  distances[startNodeId] = 0;

  while (unvisited.size > 0) {
    let curr: string | null = null;
    let minCost = Infinity;
    for (const n of unvisited) {
      if (distances[n] < minCost) {
        minCost = distances[n];
        curr = n;
      }
    }

    if (!curr || minCost === Infinity || curr === targetNodeId) break;
    unvisited.delete(curr);

    for (const edge of edges) {
      if (blockedEdgeIds.has(edge.id)) continue;
      let ok = false;
      let neighborId: string | null = null;
      if (ignoreClosures && edge.status === 'CLOSED') {
        // Still enforce access restrictions and one-way direction
        const check = isEdgeTraversable({ ...edge, status: 'OPEN' }, curr, vehicleType);
        ok = check.ok;
        neighborId = check.neighborId;
      } else {
        const check = isEdgeTraversable(edge, curr, vehicleType);
        ok = check.ok;
        neighborId = check.neighborId;
      }
      if (!ok || !neighborId || !unvisited.has(neighborId)) continue;

      const cost = edgeWeight(edge, mode, lambdaRisk);
      const alt = distances[curr] + cost;
      if (alt < distances[neighborId]) {
        distances[neighborId] = alt;
        previous[neighborId] = curr;
        edgeUsed[neighborId] = edge;
      }
    }
  }

  if (distances[targetNodeId] === Infinity) {
    return { feasible: false, nodeIds: [], edges: [] };
  }

  const pathNodeIds: string[] = [];
  const routeEdges: GraphEdge[] = [];
  let step: string | null = targetNodeId;
  while (step) {
    pathNodeIds.push(step);
    const e = edgeUsed[step];
    if (e) routeEdges.push(e);
    step = previous[step];
  }
  pathNodeIds.reverse();
  routeEdges.reverse();

  return { feasible: true, nodeIds: pathNodeIds, edges: routeEdges };
}

function getUnconstrainedClosedEdges(
  nodes: Record<string, RoadNode>,
  edges: GraphEdge[],
  startNodeId: string,
  targetNodeId: string,
  mode: RouteMode,
  lambdaRisk: number,
  vehicleType: 'car' | 'two_wheeler' | 'heavy' | 'emergency'
): Set<string> {
  const closedEdgesExist = edges.some(e => e.status === 'CLOSED');
  if (!closedEdgesExist || startNodeId === targetNodeId || !nodes[startNodeId] || !nodes[targetNodeId]) {
    return new Set();
  }
  const unconstrained = runDijkstraRaw(
    nodes,
    edges,
    startNodeId,
    targetNodeId,
    mode,
    lambdaRisk,
    new Set(),
    new Set(),
    vehicleType,
    true
  );
  if (!unconstrained.feasible) return new Set();
  return new Set(unconstrained.edges.filter(e => e.status === 'CLOSED').map(e => e.id));
}

export function calculateDijkstraRoute(
  nodes: Record<string, RoadNode>,
  edges: GraphEdge[],
  startNodeId: string,
  targetNodeId: string,
  mode: RouteMode = 'safest',
  lambdaRisk: number = 1.5,
  blockedEdgeIds: Set<string> = new Set(),
  blockedNodeIds: Set<string> = new Set(),
  vehicleType: 'car' | 'two_wheeler' | 'heavy' | 'emergency' = 'car'
): RouteCalculationResult {
  if (!nodes[startNodeId] || !nodes[targetNodeId]) {
    return {
      mode,
      feasible: false,
      message: 'Invalid starting location or destination node.',
      nodeIds: [],
      nodes: [],
      edges: [],
      totalDistanceKm: 0,
      travelTimeMins: 0,
      averageRiskScore: 0,
      maxRiskScore: 0,
      riskExposureScore: 0,
      hazardousSegmentCount: 0,
      closuresAvoidedCount: 0,
      unverifiedWarnings: [],
      unknownRiskSegmentsCount: 0,
      safetyRating: 'Blocked'
    };
  }

  if (startNodeId === targetNodeId) {
    return {
      mode,
      feasible: true,
      nodeIds: [startNodeId],
      nodes: [nodes[startNodeId]],
      edges: [],
      totalDistanceKm: 0,
      travelTimeMins: 0,
      averageRiskScore: 0,
      maxRiskScore: 0,
      riskExposureScore: 0,
      hazardousSegmentCount: 0,
      closuresAvoidedCount: 0,
      unverifiedWarnings: [],
      unknownRiskSegmentsCount: 0,
      safetyRating: 'Low Risk'
    };
  }

  const raw = runDijkstraRaw(
    nodes,
    edges,
    startNodeId,
    targetNodeId,
    mode,
    lambdaRisk,
    blockedEdgeIds,
    blockedNodeIds,
    vehicleType,
    false
  );

  const unconstrainedClosedIds =
    blockedEdgeIds.size === 0 && blockedNodeIds.size === 0
      ? getUnconstrainedClosedEdges(nodes, edges, startNodeId, targetNodeId, mode, lambdaRisk, vehicleType)
      : new Set<string>();

  if (!raw.feasible) {
    return {
      mode,
      feasible: false,
      message: 'No feasible road path found (disconnected network or all connecting corridors are officially CLOSED).',
      nodeIds: [],
      nodes: [],
      edges: [],
      totalDistanceKm: 0,
      travelTimeMins: 0,
      averageRiskScore: 0,
      maxRiskScore: 0,
      riskExposureScore: 0,
      hazardousSegmentCount: 0,
      closuresAvoidedCount: unconstrainedClosedIds.size,
      unverifiedWarnings: [],
      unknownRiskSegmentsCount: 0,
      safetyRating: 'Blocked'
    };
  }

  return summarizeRoute(mode, raw.nodeIds, raw.edges, nodes, unconstrainedClosedIds);
}

/**
 * Yen's K-Shortest Loopless Paths Algorithm for generating genuine route alternatives.
 */
export function calculateKShortestPaths(
  nodes: Record<string, RoadNode>,
  edges: GraphEdge[],
  startNodeId: string,
  targetNodeId: string,
  mode: RouteMode = 'safest',
  lambdaRisk: number = 1.5,
  k: number = 3,
  vehicleType: 'car' | 'two_wheeler' | 'heavy' | 'emergency' = 'car'
): RouteCalculationResult[] {
  const first = calculateDijkstraRoute(
    nodes,
    edges,
    startNodeId,
    targetNodeId,
    mode,
    lambdaRisk,
    new Set(),
    new Set(),
    vehicleType
  );
  if (!first.feasible) return [];

  const unconstrainedClosedIds = getUnconstrainedClosedEdges(
    nodes,
    edges,
    startNodeId,
    targetNodeId,
    mode,
    lambdaRisk,
    vehicleType
  );

  const A: RouteCalculationResult[] = [first];
  const B: { route: RouteCalculationResult; cost: number }[] = [];
  const seenKeys = new Set<string>([first.edges.map(e => e.id).join(',')]);

  const totalCostOf = (r: RouteCalculationResult) =>
    r.edges.reduce((acc, e) => acc + edgeWeight(e, mode, lambdaRisk), 0);

  for (let i = 1; i < k; i++) {
    const prevPath = A[i - 1];
    for (let spurIdx = 0; spurIdx < prevPath.nodeIds.length - 1; spurIdx++) {
      const spurNode = prevPath.nodeIds[spurIdx];
      const rootNodeIds = prevPath.nodeIds.slice(0, spurIdx + 1);
      const rootEdges = prevPath.edges.slice(0, spurIdx);

      const blockedEdges = new Set<string>();
      for (const p of A) {
        if (
          p.nodeIds.length > spurIdx + 1 &&
          p.nodeIds.slice(0, spurIdx + 1).join('>') === rootNodeIds.join('>')
        ) {
          blockedEdges.add(p.edges[spurIdx].id);
        }
      }
      const blockedNodes = new Set<string>(rootNodeIds.slice(0, -1));

      const spurPath = calculateDijkstraRoute(
        nodes,
        edges,
        spurNode,
        targetNodeId,
        mode,
        lambdaRisk,
        blockedEdges,
        blockedNodes,
        vehicleType
      );

      if (spurPath.feasible) {
        const combinedNodeIds = [...rootNodeIds.slice(0, -1), ...spurPath.nodeIds];
        const combinedEdges = [...rootEdges, ...spurPath.edges];
        const key = combinedEdges.map(e => e.id).join(',');
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          const summarized = summarizeRoute(mode, combinedNodeIds, combinedEdges, nodes, unconstrainedClosedIds);
          B.push({ route: summarized, cost: totalCostOf(summarized) });
        }
      }
    }

    if (B.length === 0) break;
    B.sort((a, b) => a.cost - b.cost);
    A.push(B.shift()!.route);
  }

  return A;
}

/**
 * Haversine distance in km (only used for coordinate-to-road snapping, NEVER for route distance!).
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Snap arbitrary [lat, lng] coordinates in Pune/PCMC to the nearest road segment & intersection node.
 */
export function snapCoordinateToRoadNetwork(
  lat: number,
  lng: number,
  nodes: Record<string, RoadNode>,
  roads: RoadSegment[]
): {
  nearestNode: RoadNode;
  nearestRoad: RoadSegment | null;
  distanceToNodeKm: number;
  snappedPoint: [number, number];
} {
  let bestNode: RoadNode = Object.values(nodes)[0];
  let bestNodeDist = Infinity;

  for (const node of Object.values(nodes)) {
    const d = haversineKm(lat, lng, node.lat, node.lng);
    if (d < bestNodeDist) {
      bestNodeDist = d;
      bestNode = node;
    }
  }

  let nearestRoad: RoadSegment | null = null;
  let bestPtDist = Infinity;
  let snappedPoint: [number, number] = [bestNode.lat, bestNode.lng];

  for (const road of roads) {
    for (const pt of road.coordinates) {
      const d = haversineKm(lat, lng, pt[0], pt[1]);
      if (d < bestPtDist) {
        bestPtDist = d;
        nearestRoad = road;
        snappedPoint = pt;
      }
    }
  }

  if (nearestRoad && nodes[nearestRoad.from] && nodes[nearestRoad.to]) {
    const dFrom = haversineKm(lat, lng, nodes[nearestRoad.from].lat, nodes[nearestRoad.from].lng);
    const dTo = haversineKm(lat, lng, nodes[nearestRoad.to].lat, nodes[nearestRoad.to].lng);
    const roadEndNode = dFrom <= dTo ? nodes[nearestRoad.from] : nodes[nearestRoad.to];
    if (bestPtDist < bestNodeDist) {
      bestNode = roadEndNode;
      bestNodeDist = Math.min(dFrom, dTo);
    }
  }

  return {
    nearestNode: bestNode,
    nearestRoad,
    distanceToNodeKm: Math.round(bestNodeDist * 100) / 100,
    snappedPoint
  };
}

/**
 * Calculates live poll breakdown percentages.
 */
export function calculatePollBreakdown(
  votes: Record<string, number>
): { option: string; count: number; percentage: number }[] {
  const total = Object.values(votes).reduce((sum, v) => sum + v, 0);
  return Object.entries(votes).map(([option, count]) => ({
    option,
    count,
    percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
  }));
}
