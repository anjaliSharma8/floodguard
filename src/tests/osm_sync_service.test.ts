import test from 'node:test';
import assert from 'node:assert/strict';
import { SanketSetuDatabase } from '../db/database';
import {
  matchDeterministicRoadId,
  validateGraphTopology,
  executeOsmSynchronization,
  registerGraphUpdateListener
} from '../services/osmSyncService';
import { User } from '../types';

test('DETERMINISTIC ROAD ID MAPPING: Maps corridors to canonical R01-R108 and generates deterministic OSM IDs for new roads', () => {
  // Test 1: Exact endpoint match for Fergusson College Road
  const r01Match = matchDeterministicRoadId('N_SHIVAJINAGAR', 'N_DECCAN', 'FC Road');
  assert.equal(r01Match.matchedId, 'R01');
  assert.equal(r01Match.confidence, 1.0);
  assert.equal(r01Match.isExisting, true);

  // Test 2: Reverse match on bidirectional Karve Road
  const r03Match = matchDeterministicRoadId('N_NAL_STOP', 'N_DECCAN', 'Karve Road');
  assert.equal(r03Match.matchedId, 'R03');
  assert.ok(r03Match.confidence >= 0.95);
  assert.equal(r03Match.isExisting, true);

  // Test 3: New road corridor gets deterministic synthetic ID
  const newMatch = matchDeterministicRoadId('N_KOTHRUD', 'N_WARJE', 'New Flyover Link');
  assert.equal(newMatch.matchedId, 'OSM_KOTHRUD_WARJE');
  assert.equal(newMatch.isExisting, false);
});

test('GRAPH TOPOLOGY VALIDATION: Enforces reachability across major sectors before activation', () => {
  const db = new SanketSetuDatabase(':memory:');
  const nodes = db.getRoadNodes();
  const roads = db.getRoadSegments();

  // Test 1: Valid comprehensive road graph passes 100% reachability
  const validation = validateGraphTopology(nodes, roads);
  assert.equal(validation.isValid, true);
  assert.equal(validation.passedCount, validation.totalCount);
  assert.equal(validation.failedPairs.length, 0);

  // Test 2: Corrupt graph missing key node fails validation
  const brokenNodes = { ...nodes };
  delete brokenNodes['N_SWARGATE'];
  const brokenValidation = validateGraphTopology(brokenNodes, roads);
  assert.equal(brokenValidation.isValid, false);
  assert.ok(brokenValidation.failedPairs.some(p => p.includes('N_SWARGATE')));

  db.close();
});

test('DYNAMIC IN-MEMORY ACTIVATION: Sync notifies listeners atomically without server restart', async () => {
  const db = new SanketSetuDatabase(':memory:');
  db.db.prepare("UPDATE road_segments SET status = 'VERIFIED_HAZARD' WHERE road_id = ?").run('R08');

  let listenerFired = false;
  let receivedNodesCount = 0;
  let receivedRoadsCount = 0;

  const unsubscribe = registerGraphUpdateListener((updatedNodes, updatedRoads) => {
    listenerFired = true;
    receivedNodesCount = Object.keys(updatedNodes).length;
    receivedRoadsCount = updatedRoads.length;
  });

  const mockExpert: User = {
    id: 'USR_EXPERT_01',
    fullName: 'Dr. Suresh Gaikwad',
    email: 'gaikwad@punedisaster.gov.in',
    role: 'EXPERT',
    accountStatus: 'ACTIVE',
    createdAt: new Date().toISOString()
  };

  const result = await executeOsmSynchronization(db, 'MANUAL', mockExpert);
  unsubscribe();

  assert.equal(result.success, true);
  assert.ok(result.edgesCount >= 108);
  assert.equal(listenerFired, true, 'Runtime graph listener must be notified dynamically');
  assert.ok(receivedNodesCount >= 69);
  assert.ok(receivedRoadsCount >= 108);

  // Verify sync was recorded in database log
  const latestLog = db.getLatestOsmSync();
  assert.ok(latestLog);
  assert.equal(latestLog.syncType, 'MANUAL');
  assert.equal(latestLog.status, 'SUCCESS');

  // Verify that R08 VERIFIED_HAZARD status was strictly preserved
  const r08After = db.getRoadSegments().find(r => r.id === 'R08');
  assert.ok(r08After);
  assert.equal(r08After.status, 'VERIFIED_HAZARD', 'Hazard status must be preserved across sync');

  db.close();
});
