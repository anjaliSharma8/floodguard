import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SanketSetuDatabase } from '../db/database';
import { PUNE_ROAD_NODES, INITIAL_ROAD_SEGMENTS } from '../data/puneData';
import { RoadSegment } from '../types';

test('PHASE 1 MIGRATION: Schema v2 creates road_nodes and osm_sync_log while preserving hazard state', () => {
  const db = new SanketSetuDatabase(':memory:');

  // 1. Verify schema migrations
  const migrations = db.db.prepare('SELECT version, name FROM schema_migrations ORDER BY version ASC').all() as Array<{ version: number; name: string }>;
  const versions = migrations.map(m => m.version);
  assert.ok(versions.includes(1), 'Version 1 migration must be present');
  assert.ok(versions.includes(2), 'Version 2 migration must be present');

  // 2. Verify road_nodes table exists and has 69 nodes
  const nodes = db.getRoadNodes();
  const nodeCount = Object.keys(nodes).length;
  assert.ok(nodeCount >= 69, `Must have at least 69 road nodes in SQLite, got ${nodeCount}`);
  assert.ok(nodes['N_SHIVAJINAGAR'], 'Shivajinagar node must exist');
  assert.ok(nodes['N_NIGDI'], 'PCMC Nigdi node must exist');

  // 3. Seed a verified hazard and verify it is strictly preserved
  db.db.prepare("UPDATE road_segments SET status = 'VERIFIED_HAZARD' WHERE road_id = ?").run('R08');
  const roads = db.getRoadSegments();
  const r08 = roads.find(r => r.id === 'R08');
  assert.ok(r08, 'Road R08 must exist');
  assert.equal(r08.status, 'VERIFIED_HAZARD', 'R08 VERIFIED_HAZARD status must be preserved');

  // 4. Test logging to osm_sync_log
  const testSyncId = `SYNC_TEST_${Date.now()}`;
  db.recordOsmSync({
    syncId: testSyncId,
    syncType: 'MANUAL',
    status: 'SUCCESS',
    nodesCount: nodeCount,
    edgesCount: roads.length,
    roadsPreserved: 1,
    roadsAdded: 0,
    durationMs: 420,
    errorMessage: null,
    detailsJson: JSON.stringify({ verifiedCorridors: 108 }),
    createdAt: new Date().toISOString()
  });

  const latestSync = db.getLatestOsmSync();
  assert.ok(latestSync, 'Latest sync log must be queryable');
  assert.equal(latestSync.syncId, testSyncId);
  assert.equal(latestSync.status, 'SUCCESS');

  // 5. Test upsertRoadNetwork preserves closed/hazard status
  const testSegment: RoadSegment = {
    ...r08,
    name: 'Sinhagad Road (Updated Geometry)',
    distanceKm: 3.14,
    status: 'OPEN' // Sync might see the road as physically open in OSM
  };

  const upsertResult = db.upsertRoadNetwork(nodes, [testSegment]);
  assert.equal(upsertResult.preserved, 1, 'Closed/hazard road must be counted as preserved');

  const afterUpsertR08 = db.getRoadSegments().find(r => r.id === 'R08')!;
  assert.equal(afterUpsertR08.status, 'VERIFIED_HAZARD', 'Hazard status must NOT be overwritten by OSM sync');
  assert.equal(afterUpsertR08.distanceKm, 3.14, 'Road structural distance must be updated');

  db.close();
});

test('new databases avoid demo reports and v4 preserves records while clearing inferred road statuses', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sanketsetu-v4-'));
  const dbPath = path.join(directory, 'migration.db');
  try {
    const initialDb = new SanketSetuDatabase(dbPath);
    assert.deepEqual(initialDb.getReports(), []);
    assert.ok(initialDb.getRoadSegments().every(road => road.status !== 'REPORTED_WATERLOGGING'));

    const insertReport = initialDb.db.prepare(`
      INSERT INTO community_reports (
        report_id, user_id, location_name, latitude, longitude, report_type,
        description, severity, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const createdAt = new Date().toISOString();
    insertReport.run('REP_101', 'legacy-user', 'Legacy location', 18.5, 73.8, 'FLOOD', 'Legacy canned report', 'High', createdAt);
    insertReport.run('REP_102', 'legacy-user', 'Legacy location 2', 18.5, 73.8, 'FLOOD', 'Legacy canned report 2', 'High', createdAt);
    insertReport.run('REP_REAL', 'citizen-user', 'Citizen location', 18.5, 73.8, 'FLOOD', 'Persisted citizen report', 'Medium', createdAt);
    initialDb.db.prepare(`
      UPDATE road_segments
      SET status = 'REPORTED_WATERLOGGING', verified_by = NULL, status_reason = NULL
      WHERE road_id = 'R08'
    `).run();
    initialDb.db.prepare(`
      UPDATE road_segments
      SET status = 'REPORTED_WATERLOGGING', verified_by = NULL, status_reason = 'Expert-reviewed report'
      WHERE road_id = 'R09'
    `).run();
    initialDb.db.exec('ALTER TABLE expert_applications DROP COLUMN reviewed_by_id');
    initialDb.db.prepare('DELETE FROM schema_migrations WHERE version = 5').run();
    initialDb.db.prepare('DELETE FROM schema_migrations WHERE version = 4').run();
    initialDb.close();

    const migratedDb = new SanketSetuDatabase(dbPath);
    const preservedRows = migratedDb.db
      .prepare('SELECT report_id, is_demo FROM community_reports ORDER BY report_id')
      .all() as Array<{ report_id: string; is_demo: number }>;
    assert.equal(preservedRows.length, 3, 'Migration must retain every stored report');
    assert.deepEqual(migratedDb.getReports().map(report => report.id), ['REP_REAL']);
    assert.deepEqual(
      preservedRows.filter(row => row.is_demo === 1).map(row => row.report_id),
      ['REP_101', 'REP_102']
    );
    const migratedRoads = migratedDb.getRoadSegments();
    assert.equal(migratedRoads.find(road => road.id === 'R08')?.status, 'UNKNOWN');
    assert.equal(migratedRoads.find(road => road.id === 'R09')?.status, 'REPORTED_WATERLOGGING');
    const migration = migratedDb.db.prepare('SELECT version FROM schema_migrations WHERE version = 4').get();
    assert.ok(migration);
    const reviewerColumns = migratedDb.db
      .prepare('PRAGMA table_info(expert_applications)')
      .all() as Array<{ name: string }>;
    assert.ok(reviewerColumns.some(column => column.name === 'reviewed_by_id'));
    assert.ok(migratedDb.db.prepare('SELECT version FROM schema_migrations WHERE version = 5').get());
    migratedDb.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
