/**
 * FloodGuard Core Logic & Graph Engine
 * Decoupled, pure functions for:
 * 1. Explainable Rule-Based Flood Risk Assessment:
 *    Risk = (W1 * Rainfall) + (W2 * Terrain) + (W3 * Drainage) + (W4 * Historical) + (W5 * Community)
 * 2. Dijkstra-based Safe Route Calculation:
 *    Cost(e) = Travel_Time(e) + (lambda_risk * (Risk_Score(e)/100) * Penalty_Factor)
 *    Strictly avoids confirmed blocked roads.
 * 3. Community Poll & Confidence Mechanics
 */

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

export type RiskCategory = 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Critical';

export interface FloodRiskResult {
  riskScore: number;
  category: RiskCategory;
  color: string;
  factors: {
    rainfallRisk: number;
    terrainRisk: number;
    drainageRisk: number;
    historicalRisk: number;
    communityRisk: number;
  };
  weights: RiskFactorWeights;
  explainability: string;
}

/**
 * Normalizes rainfall intensity (mm) over observation duration to 0-100 scale.
 */
export function calculateRainfallFactor(rainfallMm: number, durationHrs: number = 3.0): number {
  if (rainfallMm <= 0) return 0;
  const intensity = rainfallMm / Math.max(durationHrs, 1.0);
  if (intensity >= 40) return 100.0;
  if (intensity >= 25) return 75.0 + ((intensity - 25) / 15.0) * 25.0;
  if (intensity >= 10) return 40.0 + ((intensity - 10) / 15.0) * 35.0;
  return Math.min(40.0, (intensity / 10.0) * 40.0);
}

/**
 * Lower elevations and flatter slopes (<1%) have higher waterlogging risk.
 */
export function calculateTerrainFactor(elevationM: number, slopePct: number): number {
  const elevScore = Math.max(0, Math.min(100, (590 - elevationM) * 2.2));
  const slopePenalty = slopePct < 1.0 ? 30.0 : (slopePct < 2.0 ? 15.0 : 0.0);
  return Math.max(0, Math.min(100, Math.round((elevScore * 0.7 + slopePenalty) * 10) / 10));
}

/**
 * Drainage condition factor.
 */
export function calculateDrainageFactor(condition: string): number {
  const c = condition.toLowerCase();
  switch (c) {
    case 'poor': return 90.0;
    case 'clogged': return 85.0;
    case 'moderate': return 45.0;
    case 'good': return 15.0;
    case 'excellent': return 5.0;
    default: return 50.0;
  }
}

/**
 * Calculate multi-factor explainable flood risk score.
 */
export function calculateFloodRisk(params: {
  rainfallMm: number;
  durationHrs?: number;
  elevationM: number;
  slopePct: number;
  drainageCondition: string;
  hasHistoricalFlood: boolean;
  communityRiskScore?: number;
  weights?: Partial<RiskFactorWeights>;
}): FloodRiskResult {
  const w: RiskFactorWeights = { ...DEFAULT_WEIGHTS, ...(params.weights || {}) };

  const rFactor = calculateRainfallFactor(params.rainfallMm, params.durationHrs || 3.0);
  const tFactor = calculateTerrainFactor(params.elevationM, params.slopePct);
  const dFactor = calculateDrainageFactor(params.drainageCondition);
  const hFactor = params.hasHistoricalFlood ? 85.0 : 15.0;
  const cFactor = Math.max(0, Math.min(100, params.communityRiskScore || 0));

  const rawScore = (
    w.rainfall * rFactor +
    w.terrain * tFactor +
    w.drainage * dFactor +
    w.historical * hFactor +
    w.community * cFactor
  );
  const riskScore = Math.round(Math.max(0, Math.min(100, rawScore)) * 10) / 10;

  let category: RiskCategory = 'Very Low';
  let color = '#10b981'; // green-500
  if (riskScore > 80) {
    category = 'Critical';
    color = '#ef4444'; // red-500
  } else if (riskScore > 60) {
    category = 'High';
    color = '#f97316'; // orange-500
  } else if (riskScore > 40) {
    category = 'Moderate';
    color = '#eab308'; // yellow-500
  } else if (riskScore > 20) {
    category = 'Low';
    color = '#84cc16'; // lime-500
  }

  const explainability = `Risk score ${riskScore}/100 [${category}]: Rainfall ${rFactor.toFixed(0)}%, Terrain vulnerability ${tFactor.toFixed(0)}% (elev ${params.elevationM}m), Drainage penalty ${dFactor.toFixed(0)}%, Historical record ${hFactor.toFixed(0)}%, Community reports ${cFactor.toFixed(0)}%.`;

  return {
    riskScore,
    category,
    color,
    factors: {
      rainfallRisk: Math.round(rFactor * 10) / 10,
      terrainRisk: Math.round(tFactor * 10) / 10,
      drainageRisk: Math.round(dFactor * 10) / 10,
      historicalRisk: Math.round(hFactor * 10) / 10,
      communityRisk: Math.round(cFactor * 10) / 10,
    },
    weights: w,
    explainability
  };
}

// Road Graph Definitions
export interface GraphNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  elevationM: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  name: string;
  distanceKm: number;
  speedKmph: number;
  riskScore: number;
  status: 'open' | 'caution' | 'blocked' | 'critical_waterlogged';
  baseElevationM: number;
}

export interface RouteCalculationResult {
  feasible: boolean;
  message?: string;
  nodeIds: string[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalDistanceKm: number;
  travelTimeMins: number;
  averageRiskScore: number;
  maxRiskScore: number;
  safetyRating: 'Safe' | 'Moderate' | 'Hazardous' | 'Blocked';
}

/**
 * Dijkstra graph solver supporting both Shortest and Safest modes.
 * Safest mode applies: Cost(e) = Travel_Time(e) + (lambdaRisk * (Risk_Score(e)/100) * 35.0).
 * Confirmed blocked roads (status === 'blocked') are strictly excluded from edge traversal.
 */
export function calculateDijkstraRoute(
  nodes: Record<string, GraphNode>,
  edges: GraphEdge[],
  startNodeId: string,
  targetNodeId: string,
  mode: 'shortest' | 'safest' = 'safest',
  lambdaRisk: number = 1.5
): RouteCalculationResult {
  if (!nodes[startNodeId] || !nodes[targetNodeId]) {
    return {
      feasible: false,
      message: 'Invalid starting location or destination',
      nodeIds: [],
      nodes: [],
      edges: [],
      totalDistanceKm: 0,
      travelTimeMins: 0,
      averageRiskScore: 0,
      maxRiskScore: 0,
      safetyRating: 'Blocked'
    };
  }

  if (startNodeId === targetNodeId) {
    return {
      feasible: true,
      nodeIds: [startNodeId],
      nodes: [nodes[startNodeId]],
      edges: [],
      totalDistanceKm: 0,
      travelTimeMins: 0,
      averageRiskScore: 0,
      maxRiskScore: 0,
      safetyRating: 'Safe'
    };
  }

  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const edgeUsed: Record<string, GraphEdge | null> = {};
  const unvisited = new Set<string>();

  for (const nodeId of Object.keys(nodes)) {
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

    if (!curr || minCost === Infinity || curr === targetNodeId) {
      break;
    }
    unvisited.delete(curr);

    // Examine edges connected to curr
    for (const edge of edges) {
      // NEVER traverse blocked roads
      if (edge.status === 'blocked') continue;

      let neighborId: string | null = null;
      if (edge.from === curr) neighborId = edge.to;
      else if (edge.to === curr) neighborId = edge.from;

      if (neighborId && unvisited.has(neighborId)) {
        const timeMinutes = (edge.distanceKm / edge.speedKmph) * 60;
        let edgeCost = timeMinutes;

        if (mode === 'safest') {
          // Add flood risk penalty
          const riskMultiplier = edge.status === 'critical_waterlogged' ? 2.5 : 1.0;
          const penalty = lambdaRisk * (edge.riskScore / 100.0) * 35.0 * riskMultiplier;
          edgeCost += penalty;
        }

        const alt = distances[curr] + edgeCost;
        if (alt < distances[neighborId]) {
          distances[neighborId] = alt;
          previous[neighborId] = curr;
          edgeUsed[neighborId] = edge;
        }
      }
    }
  }

  if (distances[targetNodeId] === Infinity) {
    return {
      feasible: false,
      message: 'No feasible route found. All connecting paths are currently blocked or dangerously inundated. Please follow official emergency evacuation guidance.',
      nodeIds: [],
      nodes: [],
      edges: [],
      totalDistanceKm: 0,
      travelTimeMins: 0,
      averageRiskScore: 0,
      maxRiskScore: 0,
      safetyRating: 'Blocked'
    };
  }

  // Backtrack path
  const pathNodeIds: string[] = [];
  const routeEdges: GraphEdge[] = [];
  let step: string | null = targetNodeId;

  while (step) {
    pathNodeIds.push(step);
    const edge = edgeUsed[step];
    if (edge) {
      routeEdges.push(edge);
    }
    step = previous[step];
  }

  pathNodeIds.reverse();
  routeEdges.reverse();

  let totalDist = 0;
  let totalTime = 0;
  const risks: number[] = [];

  for (const e of routeEdges) {
    totalDist += e.distanceKm;
    totalTime += (e.distanceKm / e.speedKmph) * 60;
    risks.push(e.riskScore);
  }

  const avgRisk = risks.length > 0 ? risks.reduce((a, b) => a + b, 0) / risks.length : 0;
  const maxRisk = risks.length > 0 ? Math.max(...risks) : 0;

  let safetyRating: 'Safe' | 'Moderate' | 'Hazardous' | 'Blocked' = 'Safe';
  if (avgRisk > 60 || maxRisk >= 80) safetyRating = 'Hazardous';
  else if (avgRisk > 30) safetyRating = 'Moderate';

  return {
    feasible: true,
    nodeIds: pathNodeIds,
    nodes: pathNodeIds.map(id => nodes[id]),
    edges: routeEdges,
    totalDistanceKm: Math.round(totalDist * 100) / 100,
    travelTimeMins: Math.round(totalTime * 10) / 10,
    averageRiskScore: Math.round(avgRisk * 10) / 10,
    maxRiskScore: Math.round(maxRisk * 10) / 10,
    safetyRating
  };
}

/**
 * Calculates live poll breakdown percentages.
 */
export function calculatePollBreakdown(votes: Record<string, number>): { option: string; count: number; percentage: number }[] {
  const total = Object.values(votes).reduce((sum, v) => sum + v, 0);
  return Object.entries(votes).map(([option, count]) => ({
    option,
    count,
    percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
  }));
}
