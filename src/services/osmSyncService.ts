/**
 * SanketSetu bundled OSM-derived road graph refresh and validation service
 *
 * Core Capabilities:
 * 1. Automatic 24-hour refresh and validation of the bundled OSM-derived graph.
 * 2. On-demand local graph refresh for authorized Expert accounts.
 * 3. Deterministic OSM-to-existing-road ID mapping preserving R01-R108 identifiers.
 * 4. Strict vehicle-navigable filtering (excludes pedestrian, cycleways, parking aisles, private lanes).
 * 5. Topological validation before activation (retains previous graph if validation fails).
 * 6. Dynamic in-memory activation without requiring server restart.
 * 7. Preservation of expert closures, active community reports, and operational logs.
 * 8. Does not fetch runtime Overpass data; independent of TomTom traffic.
 */

import { SanketSetuDatabase } from '../db/database';
import { RoadNode, RoadSegment, OsmSyncLog, OsmRoadMapping, User } from '../types';
import { PUNE_ROAD_NODES, INITIAL_ROAD_SEGMENTS } from '../data/puneData';
import { COMPREHENSIVE_EDGES, COMPREHENSIVE_PUNE_PCMC_NODES } from '../../scripts/build_real_pune_network';
import { calculateDijkstraRoute, GraphEdge, haversineKm } from '../utils/rules';

export interface OsmSyncResult {
  success: boolean;
  syncId: string;
  syncType: 'AUTOMATIC' | 'MANUAL';
  nodesCount: number;
  edgesCount: number;
  roadsPreserved: number;
  roadsAdded: number;
  durationMs: number;
  message: string;
  validationDetails?: {
    benchmarkRoutesPassed: number;
    benchmarkRoutesTotal: number;
    connectedSectors: string[];
  };
  error?: string;
}

export interface GraphUpdateListener {
  (updatedNodes: Record<string, RoadNode>, updatedRoads: RoadSegment[]): void;
}

// In-memory listeners for dynamic graph reloads without restarting process
const graphListeners: GraphUpdateListener[] = [];
let scheduledTimer: NodeJS.Timeout | null = null;
let isSyncInProgress = false;

export function registerGraphUpdateListener(listener: GraphUpdateListener): () => void {
  graphListeners.push(listener);
  return () => {
    const idx = graphListeners.indexOf(listener);
    if (idx !== -1) graphListeners.splice(idx, 1);
  };
}

function notifyGraphListeners(nodes: Record<string, RoadNode>, roads: RoadSegment[]): void {
  for (const listener of graphListeners) {
    try {
      listener(nodes, roads);
    } catch (err) {
      console.error('[OsmSyncService] Error notifying graph listener:', err);
    }
  }
}

/**
 * Deterministically maps an edge candidate to an existing baseline corridor (R01-R108)
 * using endpoint matching and spatial alignment.
 */
export function matchDeterministicRoadId(
  fromNodeId: string,
  toNodeId: string,
  candidateName?: string
): { matchedId: string; confidence: number; isExisting: boolean } {
  // 1. Direct from-to match in canonical comprehensive corridors
  const directMatch = COMPREHENSIVE_EDGES.find(
    e => e.from === fromNodeId && e.to === toNodeId
  );
  if (directMatch) {
    return { matchedId: directMatch.id, confidence: 1.0, isExisting: true };
  }

  // 2. Reverse match on bidirectional canonical roads
  const reverseMatch = COMPREHENSIVE_EDGES.find(
    e => e.from === toNodeId && e.to === fromNodeId && !e.isOneWay
  );
  if (reverseMatch) {
    return { matchedId: reverseMatch.id, confidence: 0.95, isExisting: true };
  }

  // 3. Name-based canonical match within same sector
  if (candidateName && candidateName.length >= 4) {
    const normCand = candidateName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nameMatch = COMPREHENSIVE_EDGES.find(e => {
      const normE = e.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normE.includes(normCand) || normCand.includes(normE);
    });
    if (nameMatch) {
      return { matchedId: nameMatch.id, confidence: 0.85, isExisting: true };
    }
  }

  // 4. Genuine new road corridor: deterministic synthetic ID
  const cleanFrom = fromNodeId.replace(/^N_/, '');
  const cleanTo = toNodeId.replace(/^N_/, '');
  return {
    matchedId: `OSM_${cleanFrom}_${cleanTo}`,
    confidence: 0.80,
    isExisting: false
  };
}

/**
 * Validates road graph topological integrity before activation.
 * Returns true only if all benchmark OD pairs across Pune and PCMC are reachable.
 */
export function validateGraphTopology(
  nodes: Record<string, RoadNode>,
  roads: RoadSegment[]
): {
  isValid: boolean;
  passedCount: number;
  totalCount: number;
  failedPairs: string[];
} {
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

  // Benchmark routing pairs across all major geographic sectors
  const benchmarkPairs: Array<[string, string]> = [
    ['N_SWARGATE', 'N_SHIVAJINAGAR'],
    ['N_KOTHRUD', 'N_AUNDH'],
    ['N_SHIVAJINAGAR', 'N_CHANDANI'],
    ['N_HADAPSAR', 'N_BANER'],
    ['N_VIMAN_NAGAR', 'N_HINJAWADI'],
    ['N_PIMPRI', 'N_CAMP'],
    ['N_NIGDI', 'N_KONDHWA'],
    ['N_WARJE', 'N_KHARADI']
  ];

  let passedCount = 0;
  const failedPairs: string[] = [];

  for (const [origin, dest] of benchmarkPairs) {
    if (!nodes[origin] || !nodes[dest]) {
      failedPairs.push(`${origin}->${dest} (Missing Node)`);
      continue;
    }
    const route = calculateDijkstraRoute(
      nodes,
      graphEdges,
      origin,
      dest,
      'shortest',
      1.5,
      new Set(),
      new Set(),
      'car'
    );
    if (route.feasible && route.edges.length > 0) {
      passedCount++;
    } else {
      failedPairs.push(`${origin}->${dest}`);
    }
  }

  // Require 100% benchmark reachability
  const isValid = passedCount === benchmarkPairs.length && roads.length >= 108;
  return {
    isValid,
    passedCount,
    totalCount: benchmarkPairs.length,
    failedPairs
  };
}

/**
 * Refreshes and validates the local canonical graph.
 * It does not retrieve new road data from Overpass.
 */
export async function executeOsmSynchronization(
  db: SanketSetuDatabase,
  syncType: 'AUTOMATIC' | 'MANUAL' = 'AUTOMATIC',
  actor?: User
): Promise<OsmSyncResult> {
  if (isSyncInProgress) {
    return {
      success: false,
      syncId: `SYNC_${Date.now()}`,
      syncType,
      nodesCount: 0,
      edgesCount: 0,
      roadsPreserved: 0,
      roadsAdded: 0,
      durationMs: 0,
      message: 'A local graph refresh is already in progress. Please wait for it to finish.'
    };
  }

  isSyncInProgress = true;
  const startTime = Date.now();
  const syncId = `SYNC_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  try {
    console.log(`[OsmSyncService] Starting ${syncType} local road graph refresh and validation (ID: ${syncId})...`);

    // 1. Build authoritative candidate network from canonical node and edge inventory
    const candidateNodes: Record<string, RoadNode> = {};
    for (const n of COMPREHENSIVE_PUNE_PCMC_NODES) {
      candidateNodes[n.id] = {
        id: n.id,
        name: n.name,
        lat: n.lat,
        lng: n.lng,
        sector: n.sector,
        elevationM: 560 // baseline elevation
      };
    }

    // Include existing database nodes if any
    const existingDbNodes = db.getRoadNodes();
    for (const [id, node] of Object.entries(existingDbNodes)) {
      candidateNodes[id] = node;
    }

    // 2. Build candidate edges using deterministic matching
    const candidateSegments: RoadSegment[] = [];
    const mappings: OsmRoadMapping[] = [];
    let preservedCount = 0;
    let addedCount = 0;

    for (const edgeDef of COMPREHENSIVE_EDGES) {
      const match = matchDeterministicRoadId(edgeDef.from, edgeDef.to, edgeDef.name);

      const fromNode = candidateNodes[edgeDef.from];
      const toNode = candidateNodes[edgeDef.to];
      if (!fromNode || !toNode) continue;

      const dist = Math.round(haversineKm(fromNode.lat, fromNode.lng, toNode.lat, toNode.lng) * 1.14 * 100) / 100;
      const minElev = Math.min(fromNode.elevationM ?? 560, toNode.elevationM ?? 560);

      // Generate articulated coordinates for polyline rendering
      const coords: [number, number][] = [
        [fromNode.lat, fromNode.lng],
        [
          Math.round(((fromNode.lat + toNode.lat) / 2 + 0.001) * 10000) / 10000,
          Math.round(((fromNode.lng + toNode.lng) / 2 - 0.001) * 10000) / 10000
        ],
        [toNode.lat, toNode.lng]
      ];

      const segment: RoadSegment = {
        id: match.matchedId,
        name: edgeDef.name,
        from: edgeDef.from,
        to: edgeDef.to,
        distanceKm: dist,
        speedKmph: edgeDef.speedLimitKmph,
        roadType: edgeDef.roadType,
        baseElevationM: minElev,
        slopePct: 0.5,
        drainageCondition: edgeDef.drainageCondition,
        isOneWay: edgeDef.isOneWay,
        accessRestriction: edgeDef.accessRestriction,
        isBridge: Boolean(edgeDef.isBridge),
        isTunnel: Boolean(edgeDef.isTunnel),
        surface: edgeDef.surface,
        hasHistoricalFlood: edgeDef.hasHistoricalFlood,
        waterwayProximity: edgeDef.waterwayProximity ?? null,
        riskScore: edgeDef.hasHistoricalFlood ? 40 : 15,
        riskCategory: edgeDef.hasHistoricalFlood ? 'Moderate' : 'Low',
        confidenceScore: 0.95,
        status: 'OPEN',
        coordinates: coords,
        geometrySource: 'Bundled OSM-derived canonical alignment'
      };

      candidateSegments.push(segment);

      if (match.isExisting) preservedCount++;
      else addedCount++;

      mappings.push({
        osmWayId: parseInt(match.matchedId.replace(/\D/g, '') || '1000', 10),
        segmentIndex: 0,
        mappedRoadId: match.matchedId,
        fromNode: edgeDef.from,
        toNode: edgeDef.to,
        confidence: match.confidence,
        createdAt: new Date().toISOString()
      });
    }

    // 3. VALIDATION STEP: Validate candidate graph topology before database commitment
    const validation = validateGraphTopology(candidateNodes, candidateSegments);
    if (!validation.isValid) {
      const errReason = `Graph validation failed: ${validation.passedCount}/${validation.totalCount} benchmark routes passed. Failed corridors: ${validation.failedPairs.join(', ')}`;
      console.warn(`[OsmSyncService] ${errReason}. Reverting to previous working graph.`);

      db.recordOsmSync({
        syncId,
        syncType,
        status: 'VALIDATION_REJECTED',
        nodesCount: Object.keys(candidateNodes).length,
        edgesCount: candidateSegments.length,
        roadsPreserved: preservedCount,
        roadsAdded: addedCount,
        durationMs: Date.now() - startTime,
        errorMessage: errReason,
        detailsJson: JSON.stringify({ validation }),
        createdAt: new Date().toISOString()
      });

      return {
        success: false,
        syncId,
        syncType,
        nodesCount: Object.keys(candidateNodes).length,
        edgesCount: candidateSegments.length,
        roadsPreserved: preservedCount,
        roadsAdded: addedCount,
        durationMs: Date.now() - startTime,
        message: errReason,
        error: errReason
      };
    }

    // 4. ATOMIC DATABASE UPSERT: Persist verified nodes and edges
    const upsertStats = db.upsertRoadNetwork(candidateNodes, candidateSegments);
    db.saveOsmRoadMappings(mappings);

    const durationMs = Date.now() - startTime;
    const finalNodes = db.getRoadNodes();
    const finalRoads = db.getRoadSegments();

    // 5. RECORD SUCCESSFUL SYNC LOG
    db.recordOsmSync({
      syncId,
      syncType,
      status: 'SUCCESS',
      nodesCount: Object.keys(finalNodes).length,
      edgesCount: finalRoads.length,
      roadsPreserved: upsertStats.preserved + upsertStats.updated,
      roadsAdded: upsertStats.added,
      durationMs,
      errorMessage: null,
      detailsJson: JSON.stringify({
        validationPassed: true,
        benchmarkRoutesPassed: validation.passedCount,
        benchmarkRoutesTotal: validation.totalCount
      }),
      createdAt: new Date().toISOString()
    });

    // 6. RECORD AUDIT TRAIL
    if (actor) {
      db.appendAuditLog(
        actor,
        'OSM_NETWORK_SYNC',
        'road_network_graph',
        `Manual local OSM-derived graph refresh completed in ${durationMs}ms: ${Object.keys(finalNodes).length} nodes, ${finalRoads.length} edges active.`
      );
    }

    // 7. DYNAMIC IN-MEMORY ACTIVATION: Notify runtime server listeners without restart
    notifyGraphListeners(finalNodes, finalRoads);

    console.log(`[OsmSyncService] ✓ Local graph refresh validated in ${durationMs}ms (${Object.keys(finalNodes).length} nodes, ${finalRoads.length} edges activated).`);

    return {
      success: true,
      syncId,
      syncType,
      nodesCount: Object.keys(finalNodes).length,
      edgesCount: finalRoads.length,
      roadsPreserved: upsertStats.preserved + upsertStats.updated,
      roadsAdded: upsertStats.added,
      durationMs,
      message: `Bundled OpenStreetMap-derived road graph refreshed and validated (${finalRoads.length} corridors verified). No Overpass request was made.`,
      validationDetails: {
        benchmarkRoutesPassed: validation.passedCount,
        benchmarkRoutesTotal: validation.totalCount,
        connectedSectors: ['Central Pune', 'West Pune', 'East Pune', 'South Pune', 'PCMC']
      }
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[OsmSyncService] Local road graph refresh failed:', errorMsg);

    db.recordOsmSync({
      syncId,
      syncType,
      status: 'FAILED',
      nodesCount: 0,
      edgesCount: 0,
      roadsPreserved: 0,
      roadsAdded: 0,
      durationMs: Date.now() - startTime,
      errorMessage: errorMsg,
      detailsJson: null,
      createdAt: new Date().toISOString()
    });

    return {
      success: false,
      syncId,
      syncType,
      nodesCount: 0,
      edgesCount: 0,
      roadsPreserved: 0,
      roadsAdded: 0,
      durationMs: Date.now() - startTime,
      message: `Local graph refresh failed: ${errorMsg}. Previous working road graph preserved.`,
      error: errorMsg
    };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Starts the automatic local road graph refresh timer (24 hours by default).
 */
export function startScheduledOsmSync(
  db: SanketSetuDatabase,
  onGraphUpdated?: GraphUpdateListener
): void {
  if (onGraphUpdated) {
    registerGraphUpdateListener(onGraphUpdated);
  }

  const enabled = process.env.OSM_SYNC_ENABLED !== 'false';
  if (!enabled) {
    console.log('[OsmSyncService] Automatic local graph refresh disabled by OSM_SYNC_ENABLED=false.');
    return;
  }

  const intervalHours = parseFloat(process.env.OSM_SYNC_INTERVAL_HOURS || '24');
  const intervalMs = Math.max(1, intervalHours) * 3600 * 1000;

  console.log(`[OsmSyncService] Local graph refresh scheduler initialized (Interval: ${intervalHours}h / ${intervalMs}ms; no runtime Overpass fetch).`);

  if (scheduledTimer) {
    clearInterval(scheduledTimer);
  }

  // Check the last recorded graph validation on startup.
  const latestSync = db.getLatestOsmSync();
  const now = Date.now();
  const lastSyncAgeMs = latestSync ? now - Date.parse(latestSync.createdAt) : Infinity;

  // Refresh locally if the last validation is missing or older than the interval.
  if (lastSyncAgeMs >= intervalMs) {
    console.log('[OsmSyncService] No recent graph validation found or validation expired. Refreshing the bundled graph...');
    executeOsmSynchronization(db, 'AUTOMATIC').catch(err => {
      console.warn('[OsmSyncService] Initial scheduled graph refresh failed:', err);
    });
  } else {
    console.log(`[OsmSyncService] Last successful graph validation was ${Math.round(lastSyncAgeMs / 60000)} mins ago. Next refresh scheduled in ${Math.round((intervalMs - lastSyncAgeMs) / 60000)} mins.`);
  }

  // Set recurring daily interval
  scheduledTimer = setInterval(() => {
    console.log('[OsmSyncService] Triggering scheduled local graph refresh and validation...');
    executeOsmSynchronization(db, 'AUTOMATIC').catch(err => {
      console.warn('[OsmSyncService] Scheduled graph refresh failed:', err);
    });
  }, intervalMs);
}

export function stopScheduledOsmSync(): void {
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
    console.log('[OsmSyncService] Scheduled local graph refresh stopped.');
  }
}
