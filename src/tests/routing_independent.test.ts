import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDijkstraRoute,
  calculateKShortestPaths,
  computeEdgeTravelTimeMinutes,
  computeEdgeRiskTimeMinutes,
  edgeWeight,
  GraphEdge
} from '../utils/rules';
import { RoadNode } from '../types';
import { PUNE_ROAD_NODES, INITIAL_ROAD_SEGMENTS } from '../data/puneData';

test('SYNTHETIC GRAPH: Demonstrates Shortest -> Path A, Fastest -> Path B, Safest -> Path C', () => {
  const nodes: Record<string, RoadNode> = {
    ORIGIN: { id: 'ORIGIN', name: 'Start Hub', lat: 18.52, lng: 73.84, elevationM: 560 },
    DEST: { id: 'DEST', name: 'Destination Hub', lat: 18.50, lng: 73.82, elevationM: 550 },
    MID_A: { id: 'MID_A', name: 'Path A Waypoint', lat: 18.51, lng: 73.83, elevationM: 555 },
    MID_B: { id: 'MID_B', name: 'Path B Waypoint', lat: 18.53, lng: 73.85, elevationM: 545 },
    MID_C: { id: 'MID_C', name: 'Path C Waypoint', lat: 18.49, lng: 73.80, elevationM: 580 }
  };

  // Path A: 4 km, 40 km/h, Low flood risk (risk = 25)
  // Distance: 4.0 km, Travel Time: 6.0 min
  // Path B: 5 km, 60 km/h, High flood risk (risk = 85)
  // Distance: 5.0 km, Travel Time: 5.0 min
  // Path C: 7 km, 35 km/h, Very low flood risk (risk = 5)
  // Distance: 7.0 km, Travel Time: 12.0 min
  const edges: GraphEdge[] = [
    // Path A segments (2km + 2km = 4km @ 40km/h, risk 25)
    { id: 'EA1', from: 'ORIGIN', to: 'MID_A', name: 'Path A Seg 1', distanceKm: 2.0, speedKmph: 40, riskScore: 25, status: 'OPEN', baseElevationM: 555, isOneWay: false },
    { id: 'EA2', from: 'MID_A', to: 'DEST', name: 'Path A Seg 2', distanceKm: 2.0, speedKmph: 40, riskScore: 25, status: 'OPEN', baseElevationM: 555, isOneWay: false },

    // Path B segments (2.5km + 2.5km = 5km @ 60km/h, risk 85)
    { id: 'EB1', from: 'ORIGIN', to: 'MID_B', name: 'Path B Seg 1 (Express)', distanceKm: 2.5, speedKmph: 60, riskScore: 85, status: 'OPEN', baseElevationM: 545, isOneWay: false },
    { id: 'EB2', from: 'MID_B', to: 'DEST', name: 'Path B Seg 2 (Express)', distanceKm: 2.5, speedKmph: 60, riskScore: 85, status: 'OPEN', baseElevationM: 545, isOneWay: false },

    // Path C segments (3.5km + 3.5km = 7km @ 35km/h, risk 5)
    { id: 'EC1', from: 'ORIGIN', to: 'MID_C', name: 'Path C Seg 1 (High Ridge)', distanceKm: 3.5, speedKmph: 35, riskScore: 5, status: 'OPEN', baseElevationM: 580, isOneWay: false },
    { id: 'EC2', from: 'MID_C', to: 'DEST', name: 'Path C Seg 2 (High Ridge)', distanceKm: 3.5, speedKmph: 35, riskScore: 5, status: 'OPEN', baseElevationM: 580, isOneWay: false }
  ];

  // 1. Shortest Route Selection
  const shortest = calculateDijkstraRoute(nodes, edges, 'ORIGIN', 'DEST', 'shortest');
  assert.equal(shortest.feasible, true);
  assert.deepEqual(shortest.nodeIds, ['ORIGIN', 'MID_A', 'DEST'], 'Shortest must select Path A');
  assert.equal(shortest.totalDistanceKm, 4.0, 'Shortest must minimize distance (4.0 km)');

  // 2. Fastest Route Selection
  const fastest = calculateDijkstraRoute(nodes, edges, 'ORIGIN', 'DEST', 'fastest');
  assert.equal(fastest.feasible, true);
  assert.deepEqual(fastest.nodeIds, ['ORIGIN', 'MID_B', 'DEST'], 'Fastest must select Path B');
  assert.equal(fastest.travelTimeMins, 5.0, 'Fastest must minimize travel time (5.0 mins)');

  // 3. Safest Route Selection (at high risk tolerance lambda = 2.0)
  const safest = calculateDijkstraRoute(nodes, edges, 'ORIGIN', 'DEST', 'safest', 2.0);
  assert.equal(safest.feasible, true);
  assert.deepEqual(safest.nodeIds, ['ORIGIN', 'MID_C', 'DEST'], 'Safest must select Path C');
  assert.equal(safest.averageRiskScore, 5, 'Safest must select the very low flood risk corridor');

  // Verify all 3 routes chose completely distinct paths
  assert.notEqual(shortest.nodeIds.join('>'), fastest.nodeIds.join('>'));
  assert.notEqual(fastest.nodeIds.join('>'), safest.nodeIds.join('>'));
  assert.notEqual(shortest.nodeIds.join('>'), safest.nodeIds.join('>'));

  // 4. Verification of criteria:
  // Shortest has strictly less distance than fastest and safest
  assert.ok(shortest.totalDistanceKm < fastest.totalDistanceKm);
  assert.ok(shortest.totalDistanceKm < safest.totalDistanceKm);

  // Fastest has strictly less travel time than shortest and safest
  assert.ok(fastest.travelTimeMins < shortest.travelTimeMins);
  assert.ok(fastest.travelTimeMins < safest.travelTimeMins);

  // Safest has strictly less flood risk than shortest and fastest
  assert.ok(safest.averageRiskScore < shortest.averageRiskScore);
  assert.ok(safest.averageRiskScore < fastest.averageRiskScore);

  // 5. Verification: Every metric matches its reconstructed path
  assert.equal(shortest.edges.reduce((sum, e) => sum + e.distanceKm, 0), shortest.totalDistanceKm);
  assert.equal(Math.round(fastest.edges.reduce((sum, e) => sum + (e.distanceKm / e.speedKmph) * 60, 0) * 10) / 10, fastest.travelTimeMins);
  assert.equal(safest.edges.reduce((sum, e) => sum + e.distanceKm, 0), safest.totalDistanceKm);

  // 6. Verification: Increasing lambda does NOT alter Shortest or Fastest
  const shortestL1 = calculateDijkstraRoute(nodes, edges, 'ORIGIN', 'DEST', 'shortest', 0.5);
  const shortestL4 = calculateDijkstraRoute(nodes, edges, 'ORIGIN', 'DEST', 'shortest', 4.0);
  assert.deepEqual(shortestL1.nodeIds, shortest.nodeIds);
  assert.deepEqual(shortestL4.nodeIds, shortest.nodeIds);

  const fastestL1 = calculateDijkstraRoute(nodes, edges, 'ORIGIN', 'DEST', 'fastest', 0.5);
  const fastestL4 = calculateDijkstraRoute(nodes, edges, 'ORIGIN', 'DEST', 'fastest', 4.0);
  assert.deepEqual(fastestL1.nodeIds, fastest.nodeIds);
  assert.deepEqual(fastestL4.nodeIds, fastest.nodeIds);

  // 7. Verification: Lambda sensitivity - changing lambda shifts safest route when appropriate
  const safestZeroLambda = calculateDijkstraRoute(nodes, edges, 'ORIGIN', 'DEST', 'safest', 0.0);
  assert.deepEqual(safestZeroLambda.nodeIds, ['ORIGIN', 'MID_B', 'DEST'], 'Lambda 0 prioritizes pure travel time (Path B)');

  const safestMidLambda = calculateDijkstraRoute(nodes, edges, 'ORIGIN', 'DEST', 'safest', 0.5);
  assert.deepEqual(safestMidLambda.nodeIds, ['ORIGIN', 'MID_A', 'DEST'], 'Mid lambda balances time and moderate risk (Path A)');

  const safestHighLambda = calculateDijkstraRoute(nodes, edges, 'ORIGIN', 'DEST', 'safest', 2.0);
  assert.deepEqual(safestHighLambda.nodeIds, ['ORIGIN', 'MID_C', 'DEST'], 'High lambda insists on lowest flood risk (Path C)');
});

test('ROUTING CONSTRAINTS: Closed roads, one-way restrictions, disconnected nodes, and convergence', () => {
  const nodes: Record<string, RoadNode> = {
    N1: { id: 'N1', name: 'Node 1', lat: 18.5, lng: 73.8, elevationM: 550 },
    N2: { id: 'N2', name: 'Node 2', lat: 18.5, lng: 73.81, elevationM: 550 },
    N3: { id: 'N3', name: 'Node 3', lat: 18.5, lng: 73.82, elevationM: 550 },
    ISLAND: { id: 'ISLAND', name: 'Disconnected Island', lat: 18.7, lng: 73.9, elevationM: 600 }
  };

  // 1. Closed roads are strictly excluded
  const edgesWithClosed: GraphEdge[] = [
    { id: 'E_CLOSED', from: 'N1', to: 'N2', name: 'Bridge Under Flood Water', distanceKm: 1.0, speedKmph: 40, riskScore: 100, status: 'CLOSED', isOneWay: false, baseElevationM: 550 },
    { id: 'E_DETOUR', from: 'N1', to: 'N3', name: 'Safe Detour High Bridge', distanceKm: 3.0, speedKmph: 40, riskScore: 10, status: 'OPEN', isOneWay: false, baseElevationM: 550 },
    { id: 'E_LINK', from: 'N3', to: 'N2', name: 'Detour Connector', distanceKm: 2.0, speedKmph: 40, riskScore: 10, status: 'OPEN', isOneWay: false, baseElevationM: 550 }
  ];
  const routeAvoidsClosed = calculateDijkstraRoute(nodes, edgesWithClosed, 'N1', 'N2', 'shortest');
  assert.equal(routeAvoidsClosed.feasible, true);
  assert.deepEqual(routeAvoidsClosed.nodeIds, ['N1', 'N3', 'N2'], 'Closed road must be avoided despite being shorter');
  assert.equal(routeAvoidsClosed.edges.some(e => e.id === 'E_CLOSED'), false);

  // 2. One-Way restrictions are strictly obeyed
  const edgesOneWay: GraphEdge[] = [
    { id: 'E_ONEWAY', from: 'N1', to: 'N2', name: 'One Way Eastbound', distanceKm: 1.0, speedKmph: 40, riskScore: 10, status: 'OPEN', isOneWay: true, baseElevationM: 550 }
  ];
  const forward = calculateDijkstraRoute(nodes, edgesOneWay, 'N1', 'N2', 'shortest');
  assert.equal(forward.feasible, true);
  const backward = calculateDijkstraRoute(nodes, edgesOneWay, 'N2', 'N1', 'shortest');
  assert.equal(backward.feasible, false, 'Travel against one-way must be blocked');

  // 3. Disconnected nodes return appropriate error
  const disconnected = calculateDijkstraRoute(nodes, edgesOneWay, 'N1', 'ISLAND', 'shortest');
  assert.equal(disconnected.feasible, false);
  assert.ok(disconnected.message?.includes('No feasible road path found'));

  // 4. Mathematical Convergence: Single available corridor converges honestly
  const singleCorridor: GraphEdge[] = [
    { id: 'E_ONLY', from: 'N1', to: 'N2', name: 'Sole Mountain Pass', distanceKm: 2.5, speedKmph: 50, riskScore: 15, status: 'OPEN', isOneWay: false, baseElevationM: 550 }
  ];
  const sOnly = calculateDijkstraRoute(nodes, singleCorridor, 'N1', 'N2', 'shortest');
  const fOnly = calculateDijkstraRoute(nodes, singleCorridor, 'N1', 'N2', 'fastest');
  const safeOnly = calculateDijkstraRoute(nodes, singleCorridor, 'N1', 'N2', 'safest');
  assert.equal(sOnly.feasible, true);
  assert.equal(fOnly.feasible, true);
  assert.equal(safeOnly.feasible, true);
  assert.equal(sOnly.totalDistanceKm, fOnly.totalDistanceKm);
  assert.equal(fOnly.totalDistanceKm, safeOnly.totalDistanceKm);
  assert.equal(sOnly.travelTimeMins, fOnly.travelTimeMins);
});

test('REAL PUNE NETWORK: Verifies multiple OD pairs (Swargate-Shivajinagar, Kothrud-Aundh, Chandani Chowk)', () => {
  const graphEdges: GraphEdge[] = INITIAL_ROAD_SEGMENTS.map(r => ({
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

  // Test 1: Shivajinagar -> Chandani Chowk
  const sSC = calculateDijkstraRoute(PUNE_ROAD_NODES, graphEdges, 'N_SHIVAJINAGAR', 'N_CHANDANI', 'shortest');
  const fSC = calculateDijkstraRoute(PUNE_ROAD_NODES, graphEdges, 'N_SHIVAJINAGAR', 'N_CHANDANI', 'fastest');
  assert.equal(sSC.feasible, true);
  assert.equal(fSC.feasible, true);
  // Shortest goes via city center (FC Rd -> Karve Rd -> Paud Rd): 13.44 km
  // Fastest goes via Ganeshkhind & Pashan Highway: 16.16 km @ 65 kmph -> 19.8 mins (faster!)
  assert.ok(sSC.totalDistanceKm <= fSC.totalDistanceKm, 'Shortest is distance-optimal');
  assert.ok(fSC.travelTimeMins <= sSC.travelTimeMins, 'Fastest is time-optimal');
  assert.notEqual(sSC.edges.map(e => e.id).join(','), fSC.edges.map(e => e.id).join(','), 'Shortest and Fastest paths differ');

  // Test 2: Shivajinagar -> Swargate
  // Shortest/Fastest goes direct via Tilak Road (Alka Talkies flood hotspot)
  // Safest detours via Raja Bahadur Mill & Camp to avoid Alka Talkies
  const sSS = calculateDijkstraRoute(PUNE_ROAD_NODES, graphEdges, 'N_SHIVAJINAGAR', 'N_SWARGATE', 'shortest');
  const safeSS = calculateDijkstraRoute(PUNE_ROAD_NODES, graphEdges, 'N_SHIVAJINAGAR', 'N_SWARGATE', 'safest', 2.0);
  assert.equal(sSS.feasible, true);
  assert.equal(safeSS.feasible, true);
  assert.ok(sSS.totalDistanceKm < safeSS.totalDistanceKm, 'Shortest is shorter');
  assert.ok(safeSS.averageRiskScore < sSS.averageRiskScore, 'Safest has lower flood risk exposure');
  assert.notEqual(sSS.edges.map(e => e.id).join(','), safeSS.edges.map(e => e.id).join(','), 'Safest chooses safer detour');

  // Test 3: Shivajinagar -> Nal Stop (Honest Mathematical Convergence)
  const sSN = calculateDijkstraRoute(PUNE_ROAD_NODES, graphEdges, 'N_SHIVAJINAGAR', 'N_NAL_STOP', 'shortest');
  const fSN = calculateDijkstraRoute(PUNE_ROAD_NODES, graphEdges, 'N_SHIVAJINAGAR', 'N_NAL_STOP', 'fastest');
  const safeSN = calculateDijkstraRoute(PUNE_ROAD_NODES, graphEdges, 'N_SHIVAJINAGAR', 'N_NAL_STOP', 'safest', 1.8);
  assert.equal(sSN.feasible, true);
  assert.equal(fSN.feasible, true);
  assert.equal(safeSN.feasible, true);
  // Re-confirms that in this 46-segment topology, R01->R03 dominates the 12.3km detour R01->R08->R13 on all 3 metrics
  assert.equal(sSN.totalDistanceKm, 6.67);
  assert.equal(fSN.travelTimeMins, 11.4);
});
