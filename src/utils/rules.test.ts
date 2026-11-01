import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRainfallFactor,
  calculateTerrainFactor,
  calculateDrainageFactor,
  calculateFloodRisk,
  calculateDijkstraRoute,
  calculatePollBreakdown,
  GraphNode,
  GraphEdge
} from './rules';

test('calculateRainfallFactor scales correctly with intensity thresholds', () => {
  assert.equal(calculateRainfallFactor(0), 0);
  // 15mm in 3 hrs = 5mm/hr => (5/10)*40 = 20
  assert.equal(calculateRainfallFactor(15, 3), 20);
  // 90mm in 3 hrs = 30mm/hr => 75 + ((30-25)/15)*25 = 83.333
  const heavy = calculateRainfallFactor(90, 3);
  assert.ok(heavy > 80 && heavy < 85);
  // Extreme cloudburst > 40mm/hr => 100
  assert.equal(calculateRainfallFactor(150, 3), 100);
});

test('calculateTerrainFactor penalizes low elevation and flat slope', () => {
  // Low elevation 546m and 0.4% slope (Sinhagad road basin)
  const lowland = calculateTerrainFactor(546, 0.4);
  assert.ok(lowland > 80, `Expected high terrain risk, got ${lowland}`);

  // High elevation 620m and 4.5% slope (Katraj ridge)
  const upland = calculateTerrainFactor(620, 4.5);
  assert.equal(upland, 0);
});

test('calculateDrainageFactor maps conditions correctly', () => {
  assert.equal(calculateDrainageFactor('poor'), 90);
  assert.equal(calculateDrainageFactor('clogged'), 85);
  assert.equal(calculateDrainageFactor('moderate'), 45);
  assert.equal(calculateDrainageFactor('good'), 15);
  assert.equal(calculateDrainageFactor('excellent'), 5);
});

test('calculateFloodRisk returns explainable multi-factor result with category', () => {
  // Low risk scenario
  const lowResult = calculateFloodRisk({
    rainfallMm: 10,
    elevationM: 600,
    slopePct: 3.5,
    drainageCondition: 'good',
    hasHistoricalFlood: false,
    communityRiskScore: 5
  });
  assert.ok(lowResult.riskScore <= 30);
  assert.ok(['Very Low', 'Low'].includes(lowResult.category));
  assert.ok(lowResult.explainability.includes('Risk score'));

  // Critical flood scenario (e.g. cloudburst over Sinhagad Road)
  const criticalResult = calculateFloodRisk({
    rainfallMm: 130,
    elevationM: 546,
    slopePct: 0.4,
    drainageCondition: 'poor',
    hasHistoricalFlood: true,
    communityRiskScore: 95
  });
  assert.ok(criticalResult.riskScore > 80);
  assert.equal(criticalResult.category, 'Critical');
});

test('Dijkstra routing compares shortest vs safest and diverts around critical flooded road', () => {
  const nodes: Record<string, GraphNode> = {
    A: { id: 'A', name: 'Start Station', lat: 18.52, lng: 73.84, elevationM: 560 },
    B: { id: 'B', name: 'Direct Road (Flooded)', lat: 18.50, lng: 73.82, elevationM: 546 },
    C: { id: 'C', name: 'Detour Bypass', lat: 18.51, lng: 73.80, elevationM: 575 },
    D: { id: 'D', name: 'Destination Hospital', lat: 18.48, lng: 73.81, elevationM: 565 },
  };

  const edges: GraphEdge[] = [
    // Direct path A -> B -> D: total dist = 2 + 2 = 4km, 40kmph => 6 mins, but risk is 90!
    { id: 'E1', from: 'A', to: 'B', name: 'Direct Segment', distanceKm: 2.0, speedKmph: 40, riskScore: 90, status: 'critical_waterlogged', baseElevationM: 546 },
    { id: 'E2', from: 'B', to: 'D', name: 'Flooded Causeway', distanceKm: 2.0, speedKmph: 40, riskScore: 92, status: 'caution', baseElevationM: 545 },
    // Detour path A -> C -> D: total dist = 4 + 4 = 8km, 40kmph => 12 mins, but risk is only 15!
    { id: 'E3', from: 'A', to: 'C', name: 'High Elevation Bypass', distanceKm: 4.0, speedKmph: 40, riskScore: 15, status: 'open', baseElevationM: 575 },
    { id: 'E4', from: 'C', to: 'D', name: 'Valley Descent Road', distanceKm: 4.0, speedKmph: 40, riskScore: 20, status: 'open', baseElevationM: 570 }
  ];

  // Shortest route picks direct route (4km) despite danger
  const shortest = calculateDijkstraRoute(nodes, edges, 'A', 'D', 'shortest');
  assert.equal(shortest.feasible, true);
  assert.equal(shortest.nodeIds.join('->'), 'A->B->D');
  assert.equal(shortest.totalDistanceKm, 4.0);

  // Safest route applies flood penalty Cost(e) = T(e) + λ * R(e) and diverts through C
  const safest = calculateDijkstraRoute(nodes, edges, 'A', 'D', 'safest', 2.0);
  assert.equal(safest.feasible, true);
  assert.equal(safest.nodeIds.join('->'), 'A->C->D');
  assert.equal(safest.totalDistanceKm, 8.0);
  assert.ok(safest.averageRiskScore < shortest.averageRiskScore);
});

test('Dijkstra routing strictly excludes confirmed blocked roads', () => {
  const nodes: Record<string, GraphNode> = {
    X: { id: 'X', name: 'Node X', lat: 18.5, lng: 73.8, elevationM: 560 },
    Y: { id: 'Y', name: 'Node Y', lat: 18.6, lng: 73.8, elevationM: 560 }
  };
  const edges: GraphEdge[] = [
    { id: 'E_BLOCKED', from: 'X', to: 'Y', name: 'Bridge Washed Out', distanceKm: 2.0, speedKmph: 40, riskScore: 100, status: 'blocked', baseElevationM: 550 }
  ];

  const result = calculateDijkstraRoute(nodes, edges, 'X', 'Y', 'shortest');
  assert.equal(result.feasible, false);
  assert.ok(result.message?.includes('No feasible route found'));
});

test('calculatePollBreakdown calculates accurate percentages', () => {
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
  assert.equal(heavy?.count, 50);
});
