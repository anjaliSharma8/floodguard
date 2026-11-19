import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRainfallFactor,
  calculateTerrainFactor,
  calculateDrainageFactor,
  calculateFloodRisk,
  calculateDijkstraRoute,
  calculateKShortestPaths,
  snapCoordinateToRoadNetwork,
  calculatePollBreakdown,
  GraphEdge
} from './rules';
import { RoadNode, RoadSegment } from '../types';

test('calculateRainfallFactor handles 0, intensity thresholds, and precautionary missing data', () => {
  assert.deepEqual(calculateRainfallFactor(0), { score: 0, available: true });
  const missing = calculateRainfallFactor(null);
  assert.equal(missing.available, false);
  assert.ok(missing.score > 0, 'Missing rainfall must not default to zero risk');

  const heavy = calculateRainfallFactor(90, 3); // 30 mm/hr
  assert.equal(heavy.available, true);
  assert.ok(heavy.score >= 90, `Expected >=90, got ${heavy.score}`);

  const extreme = calculateRainfallFactor(150, 3); // 50 mm/hr
  assert.equal(extreme.score, 100);
});

test('calculateTerrainFactor penalizes low elevation/flat slope and uses precautionary baseline if missing', () => {
  const lowland = calculateTerrainFactor(546, 0.4);
  assert.equal(lowland.available, true);
  assert.ok(lowland.score > 80, `Expected high terrain risk, got ${lowland.score}`);

  const upland = calculateTerrainFactor(620, 4.5);
  assert.equal(upland.available, true);
  assert.equal(upland.score, 0);

  const missingElev = calculateTerrainFactor(null, 1.0);
  assert.equal(missingElev.available, false);
  assert.equal(missingElev.score, 50);
});

test('calculateDrainageFactor maps drainage conditions honestly including unknown', () => {
  assert.deepEqual(calculateDrainageFactor('poor'), { score: 90, available: true });
  assert.deepEqual(calculateDrainageFactor('clogged'), { score: 85, available: true });
  assert.deepEqual(calculateDrainageFactor('moderate'), { score: 45, available: true });
  assert.deepEqual(calculateDrainageFactor('good'), { score: 15, available: true });
  assert.deepEqual(calculateDrainageFactor('unknown'), { score: 55, available: false });
});

test('calculateFloodRisk flags missing factors, stale data, contradictions, and Unknown when insufficient data', () => {
  const nowIso = new Date().toISOString();

  const lowResult = calculateFloodRisk({
    rainfallMm: 5,
    elevationM: 605,
    slopePct: 3.5,
    drainageCondition: 'good',
    hasHistoricalFlood: false,
    communityRiskScore: 5,
    rainfallTimestamp: nowIso
  });
  assert.ok(lowResult.riskScore !== null && lowResult.riskScore < 25);
  assert.equal(lowResult.category, 'Low');
  assert.equal(lowResult.dataCompletenessPct, 100);
  assert.equal(lowResult.contradictionDetected, false);

  const severeResult = calculateFloodRisk({
    rainfallMm: 130,
    elevationM: 546,
    slopePct: 0.4,
    drainageCondition: 'poor',
    hasHistoricalFlood: true,
    communityRiskScore: 95,
    rainfallTimestamp: nowIso
  });
  assert.ok(severeResult.riskScore !== null && severeResult.riskScore >= 80);
  assert.equal(severeResult.category, 'Severe');

  // Contradiction: zero rainfall + severe community reports
  const contradiction = calculateFloodRisk({
    rainfallMm: 0,
    elevationM: 560,
    slopePct: 1.0,
    drainageCondition: 'moderate',
    hasHistoricalFlood: false,
    communityRiskScore: 85,
    rainfallTimestamp: nowIso
  });
  assert.equal(contradiction.contradictionDetected, true);

  // Insufficient observations => Unknown category + null riskScore
  const unknown = calculateFloodRisk({
    rainfallMm: null,
    elevationM: null,
    drainageCondition: 'unknown',
    hasHistoricalFlood: null,
    communityRiskScore: null
  });
  assert.equal(unknown.riskScore, null);
  assert.equal(unknown.category, 'Unknown');
});

test('Directed routing compares shortest, fastest, and safest and generates Yen K-shortest alternatives', () => {
  const nodes: Record<string, RoadNode> = {
    A: { id: 'A', name: 'Start', lat: 18.52, lng: 73.84, elevationM: 560 },
    B: { id: 'B', name: 'Lowland Direct', lat: 18.50, lng: 73.82, elevationM: 546 },
    C: { id: 'C', name: 'Upland Bypass', lat: 18.51, lng: 73.80, elevationM: 585 },
    E: { id: 'E', name: 'Mid Ridge', lat: 18.515, lng: 73.81, elevationM: 575 },
    D: { id: 'D', name: 'Destination', lat: 18.48, lng: 73.81, elevationM: 565 }
  };

  const edges: GraphEdge[] = [
    // Direct path A -> B -> D: 4km, slow flooded hazard (risk 92)
    { id: 'E1', from: 'A', to: 'B', name: 'Flooded Causeway', distanceKm: 2.0, speedKmph: 25, riskScore: 92, status: 'VERIFIED_HAZARD', baseElevationM: 546, isOneWay: false },
    { id: 'E2', from: 'B', to: 'D', name: 'Reported Waterlog Link', distanceKm: 2.0, speedKmph: 25, riskScore: 85, status: 'REPORTED_WATERLOGGING', baseElevationM: 545, isOneWay: false },
    // Fast highway link A -> E -> D: 5km @ 60kmph, moderate risk 45
    { id: 'E3', from: 'A', to: 'E', name: 'Expressway Approach', distanceKm: 2.5, speedKmph: 60, riskScore: 45, status: 'OPEN', baseElevationM: 575, isOneWay: true },
    { id: 'E4', from: 'E', to: 'D', name: 'Expressway Exit', distanceKm: 2.5, speedKmph: 60, riskScore: 40, status: 'OPEN', baseElevationM: 570, isOneWay: true },
    // Clean ridge path A -> C -> D: 8km @ 40kmph, risk 10
    { id: 'E5', from: 'A', to: 'C', name: 'High Elevation Ridge', distanceKm: 4.0, speedKmph: 40, riskScore: 10, status: 'OPEN', baseElevationM: 585, isOneWay: false },
    { id: 'E6', from: 'C', to: 'D', name: 'Clean Ridge Descent', distanceKm: 4.0, speedKmph: 40, riskScore: 10, status: 'OPEN', baseElevationM: 578, isOneWay: false }
  ];

  const shortest = calculateDijkstraRoute(nodes, edges, 'A', 'D', 'shortest');
  assert.equal(shortest.feasible, true);
  assert.equal(shortest.nodeIds.join('->'), 'A->B->D');
  assert.equal(shortest.totalDistanceKm, 4.0);

  const fastest = calculateDijkstraRoute(nodes, edges, 'A', 'D', 'fastest');
  assert.equal(fastest.feasible, true);
  assert.equal(fastest.nodeIds.join('->'), 'A->E->D');

  const safest = calculateDijkstraRoute(nodes, edges, 'A', 'D', 'safest', 2.0);
  assert.equal(safest.feasible, true);
  assert.equal(safest.nodeIds.join('->'), 'A->C->D');
  assert.ok(safest.averageRiskScore < shortest.averageRiskScore);

  // Respects directed one-way edges (D -> A cannot use E4/E3 backwards)
  const reverse = calculateDijkstraRoute(nodes, edges, 'D', 'A', 'fastest');
  assert.equal(reverse.nodeIds.includes('E'), false, 'Reverse travel must obey isOneWay=true on E3/E4');

  // Yen's K-shortest generates distinct paths
  const kPaths = calculateKShortestPaths(nodes, edges, 'A', 'D', 'safest', 1.5, 3);
  assert.equal(kPaths.length, 3);
});

test('Routing excludes strictly CLOSED roads while keeping REPORTED_WATERLOGGING traversable with warning', () => {
  const nodes: Record<string, RoadNode> = {
    X: { id: 'X', name: 'Node X', lat: 18.5, lng: 73.8, elevationM: 560 },
    Y: { id: 'Y', name: 'Node Y', lat: 18.6, lng: 73.8, elevationM: 560 }
  };

  const reportedEdges: GraphEdge[] = [
    { id: 'E_REP', from: 'X', to: 'Y', name: 'Unverified Waterlog', distanceKm: 2.0, speedKmph: 40, riskScore: 65, status: 'REPORTED_WATERLOGGING', baseElevationM: 550 }
  ];
  const repRes = calculateDijkstraRoute(nodes, reportedEdges, 'X', 'Y', 'shortest');
  assert.equal(repRes.feasible, true);
  assert.equal(repRes.unverifiedWarnings.length, 1);

  const closedEdges: GraphEdge[] = [
    { id: 'E_CLOSED', from: 'X', to: 'Y', name: 'Bridge Closed', distanceKm: 2.0, speedKmph: 40, riskScore: 100, status: 'CLOSED', baseElevationM: 550 }
  ];
  const closedRes = calculateDijkstraRoute(nodes, closedEdges, 'X', 'Y', 'shortest');
  assert.equal(closedRes.feasible, false);
});

test('snapCoordinateToRoadNetwork snaps arbitrary Pune coordinates to nearest node & road', () => {
  const nodes: Record<string, RoadNode> = {
    N01: { id: 'N01', name: 'Shivajinagar', lat: 18.5308, lng: 73.8475, elevationM: 556 },
    N09: { id: 'N09', name: 'Kothrud', lat: 18.5074, lng: 73.8077, elevationM: 582 }
  };
  const roads: RoadSegment[] = [
    {
      id: 'R01',
      name: 'FC Road',
      from: 'N01',
      to: 'N09',
      distanceKm: 5.2,
      speedKmph: 35,
      roadType: 'primary',
      baseElevationM: 565,
      slopePct: 1.5,
      drainageCondition: 'moderate',
      isOneWay: false,
      accessRestriction: 'all_vehicles',
      hasHistoricalFlood: false,
      riskScore: 30,
      riskCategory: 'Moderate',
      confidenceScore: 0.9,
      status: 'OPEN',
      coordinates: [[18.5308, 73.8475], [18.518, 73.825], [18.5074, 73.8077]]
    }
  ];
  const snapped = snapCoordinateToRoadNetwork(18.5305, 73.8470, nodes, roads);
  assert.equal(snapped.nearestNode.id, 'N01');
  assert.equal(snapped.nearestRoad?.id, 'R01');
  assert.ok(snapped.distanceToNodeKm < 0.5);
});

test('calculatePollBreakdown computes exact percentages', () => {
  const votes = {
    'Completely safe': 10,
    'Minor waterlogging': 20,
    'Heavy waterlogging': 50,
    'Road blocked': 20
  };
  const breakdown = calculatePollBreakdown(votes);
  assert.equal(breakdown.length, 4);
  const heavy = breakdown.find(b => b.option === 'Heavy waterlogging');
  assert.equal(heavy?.percentage, 50.0);
});

test('Real Pune road graph produces distinct shortest, fastest, and safest paths with independent metrics', async () => {
  const { PUNE_ROAD_NODES, INITIAL_ROAD_SEGMENTS } = await import('../data/puneData');
  const edges: GraphEdge[] = INITIAL_ROAD_SEGMENTS.map(r => ({
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

  // 1. N_SHIVAJINAGAR -> N_PIMPLE_SAUDAGAR: Shortest != Fastest != Safest in baseline graph
  const shortestPS = calculateDijkstraRoute(PUNE_ROAD_NODES, edges, 'N_SHIVAJINAGAR', 'N_PIMPLE_SAUDAGAR', 'shortest', 1.8);
  const fastestPS = calculateDijkstraRoute(PUNE_ROAD_NODES, edges, 'N_SHIVAJINAGAR', 'N_PIMPLE_SAUDAGAR', 'fastest', 1.8);
  const safestPS = calculateDijkstraRoute(PUNE_ROAD_NODES, edges, 'N_SHIVAJINAGAR', 'N_PIMPLE_SAUDAGAR', 'safest', 1.8);
  assert.equal(shortestPS.feasible, true);
  assert.equal(fastestPS.feasible, true);
  assert.equal(safestPS.feasible, true);

  assert.notEqual(shortestPS.edges.map(e => e.id).join(','), fastestPS.edges.map(e => e.id).join(','));
  assert.notEqual(fastestPS.edges.map(e => e.id).join(','), safestPS.edges.map(e => e.id).join(','));
  assert.ok(shortestPS.totalDistanceKm <= fastestPS.totalDistanceKm);
  assert.ok(fastestPS.travelTimeMins <= shortestPS.travelTimeMins);
  assert.ok(fastestPS.travelTimeMins <= safestPS.travelTimeMins);
  assert.ok(safestPS.averageRiskScore < fastestPS.averageRiskScore);
  assert.ok(safestPS.averageRiskScore < shortestPS.averageRiskScore);

  // 2. N_KOTHRUD -> N_AUNDH: Shortest != Fastest != Safest
  const shortestKA = calculateDijkstraRoute(PUNE_ROAD_NODES, edges, 'N_KOTHRUD', 'N_AUNDH', 'shortest', 1.8);
  const fastestKA = calculateDijkstraRoute(PUNE_ROAD_NODES, edges, 'N_KOTHRUD', 'N_AUNDH', 'fastest', 1.8);
  const safestKA = calculateDijkstraRoute(PUNE_ROAD_NODES, edges, 'N_KOTHRUD', 'N_AUNDH', 'safest', 1.8);
  assert.notEqual(shortestKA.edges.map(e => e.id).join(','), fastestKA.edges.map(e => e.id).join(','));
  assert.notEqual(fastestKA.edges.map(e => e.id).join(','), safestKA.edges.map(e => e.id).join(','));
  assert.ok(safestKA.averageRiskScore < fastestKA.averageRiskScore);

  // 3. Road closure in unrelated Nigdi (R44) does NOT inflate closuresAvoidedCount for Shivajinagar -> Kothrud,
  //    whereas closing R01 forces shortest & fastest to detour with closuresAvoidedCount === 1
  const edgesWithFarClosure = edges.map(e => (e.id === 'R44' ? { ...e, status: 'CLOSED' as const } : e));
  const farCheck = calculateDijkstraRoute(PUNE_ROAD_NODES, edgesWithFarClosure, 'N_SHIVAJINAGAR', 'N_KOTHRUD', 'shortest', 1.8);
  assert.equal(farCheck.closuresAvoidedCount, 0);

  const edgesWithR01Closed = edges.map(e => (e.id === 'R01' ? { ...e, status: 'CLOSED' as const, riskScore: 90 } : e));
  const detouredShortest = calculateDijkstraRoute(PUNE_ROAD_NODES, edgesWithR01Closed, 'N_SHIVAJINAGAR', 'N_KOTHRUD', 'shortest', 1.8);
  const detouredSafest = calculateDijkstraRoute(PUNE_ROAD_NODES, edgesWithR01Closed, 'N_SHIVAJINAGAR', 'N_KOTHRUD', 'safest', 1.8);
  assert.equal(detouredShortest.feasible, true);
  assert.equal(detouredShortest.edges.some(e => e.id === 'R01'), false);
  assert.equal(detouredShortest.closuresAvoidedCount, 1);
  // Safest already avoids riskScore 90 via Univ Circle -> Pashan -> Chandani even unconstrained
  assert.equal(detouredSafest.closuresAvoidedCount, 0);

  // 4. Localized high-risk verified hazard on R38 (Holkar Bridge) with open Bund Garden bypass causes safest/fastest to detour while shortest stays 12.2 km
  const edgesWithR38Hazard = edges.map(e => {
    if (e.id === 'R38') return { ...e, status: 'VERIFIED_HAZARD' as const, riskScore: 85 };
    if (e.id === 'R16' || e.id === 'R20' || e.id === 'R21') return { ...e, status: 'OPEN' as const, riskScore: 25 };
    return e;
  });
  const hazardShortest = calculateDijkstraRoute(PUNE_ROAD_NODES, edgesWithR38Hazard, 'N_SHIVAJINAGAR', 'N_AIRPORT', 'shortest', 1.8);
  const hazardFastest = calculateDijkstraRoute(PUNE_ROAD_NODES, edgesWithR38Hazard, 'N_SHIVAJINAGAR', 'N_AIRPORT', 'fastest', 1.8);
  const hazardSafest = calculateDijkstraRoute(PUNE_ROAD_NODES, edgesWithR38Hazard, 'N_SHIVAJINAGAR', 'N_AIRPORT', 'safest', 1.8);
  assert.equal(hazardShortest.edges[0].id, 'R38');
  assert.equal(hazardShortest.hazardousSegmentCount, 1);
  assert.notEqual(hazardSafest.edges[0].id, 'R38');
  assert.equal(hazardSafest.hazardousSegmentCount, 0);
  assert.ok(hazardSafest.maxRiskScore < hazardShortest.maxRiskScore);
  assert.notEqual(hazardFastest.edges[0].id, 'R38');

  // 5. Yen's K-shortest alternatives generate distinct loopless paths and respect vehicleType
  const restrictedEdges = edges.map(e =>
    e.id === 'R26' ? { ...e, accessRestriction: 'no_heavy_vehicles' as const } : e
  );
  const heavyAlts = calculateKShortestPaths(PUNE_ROAD_NODES, restrictedEdges, 'N_SHIVAJINAGAR', 'N_UNIV_CIRCLE', 'safest', 1.8, 3, 'heavy');
  assert.ok(heavyAlts.length >= 1);
  assert.equal(heavyAlts[0].edges.some(e => e.id === 'R26'), false, 'Heavy vehicle safest path must respect accessRestriction');
});

