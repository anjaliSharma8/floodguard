process.env.SANKETSETU_NO_LISTEN = '1';

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createSanketSetuApp } from '../../server';

function makeTmpDbPath(name: string): string {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'sanketsetu-test-'));
  return join(dir, `${name}.db`);
}

async function withServer(
  dbPath: string,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const { app, db } = createSanketSetuApp(dbPath);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(baseUrl);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
}

test('API enforces strictly two roles, blocks pending experts until peer-approved, and persists across DB reopen', async () => {
  const dbPath = makeTmpDbPath('auth-persist');
  let pendingAppId = '';
  let citizenToken = '';
  let expertToken = '';
  const pendingEmail = `ndrf.tester.${Date.now()}@ndrf.gov.in`;
  const citizenEmail = `cit.tester.${Date.now()}@pune.in`;

  await withServer(dbPath, async baseUrl => {
    // 1. Health endpoint reports strict 2 roles
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.deepEqual(health.rolesSupported, ['CITIZEN', 'EXPERT']);

    const networkRes = await fetch(`${baseUrl}/api/network/status`);
    const network = await networkRes.json();
    assert.equal(network.nodesCount, 69);
    assert.equal(network.edgesCount, 108);
    assert.equal(network.syncMode, 'LOCAL_CANONICAL_SNAPSHOT_REFRESH');
    assert.equal(network.externalFetchEnabled, false);
    assert.match(network.statusMessage, /does not fetch current data from Overpass/);

    // 2. Register citizen
    const regCit = await fetch(`${baseUrl}/api/auth/citizen/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Asha Patil',
        email: citizenEmail,
        password: 'Password@123'
      })
    });
    assert.equal(regCit.status, 201);
    const citData = await regCit.json();
    citizenToken = citData.token;
    assert.equal(citData.user.role, 'CITIZEN');

    // 3. Register new Expert -> stays PENDING_APPROVAL and login returns 403
    const regExp = await fetch(`${baseUrl}/api/auth/expert/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Cmdr. Deshmukh',
        email: pendingEmail,
        password: 'Password@123',
        organisation: 'NDRF 5th Battalion Pune',
        designation: 'Deputy Commandant'
      })
    });
    assert.equal(regExp.status, 201);
    const expData = await regExp.json();
    assert.equal(expData.user.accountStatus, 'PENDING_APPROVAL');
    pendingAppId = expData.application.id;

    const pendingLogin = await fetch(`${baseUrl}/api/auth/expert/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, password: 'Password@123' })
    });
    assert.equal(pendingLogin.status, 403);

    // 4. Dev-login active expert approves pending expert (no ADMIN role needed or present)
    const devExpertRes = await fetch(`${baseUrl}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'expert' })
    });
    assert.equal(devExpertRes.status, 200);
    const devExpert = await devExpertRes.json();
    expertToken = devExpert.token;
    assert.equal(devExpert.user.role, 'EXPERT');

    // Citizen cannot access expert endpoints
    const forbiddenApps = await fetch(`${baseUrl}/api/expert/applications`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    assert.equal(forbiddenApps.status, 403);

    const approveRes = await fetch(`${baseUrl}/api/expert/applications/${pendingAppId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${expertToken}` }
    });
    assert.equal(approveRes.status, 200);
  });

  // Reopen the SAME SQLite database file in a fresh server instance to verify persistence!
  await withServer(dbPath, async baseUrl => {
    const approvedLogin = await fetch(`${baseUrl}/api/auth/expert/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, password: 'Password@123' })
    });
    assert.equal(approvedLogin.status, 200);
    const body = await approvedLogin.json();
    assert.equal(body.user.accountStatus, 'ACTIVE');
  });
});

test('Citizen report does NOT auto-close road; expert closure excludes road from routing and enforces poll 1-vote rule', async () => {
  const dbPath = makeTmpDbPath('ops-flow');

  await withServer(dbPath, async baseUrl => {
    const citLogin = await (
      await fetch(`${baseUrl}/api/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: 'citizen' })
      })
    ).json();
    const expLogin = await (
      await fetch(`${baseUrl}/api/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: 'expert' })
      })
    ).json();

    const citToken = citLogin.token as string;
    const expToken = expLogin.token as string;

    // 1. Citizen submits waterlogging report on R01
    const repRes = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citToken}`
      },
      body: JSON.stringify({
        roadId: 'R01',
        locationName: 'JM Road Underpass',
        reportType: 'Road blocked',
        severity: 'Critical',
        description: 'Knee deep water near Balgandharva'
      })
    });
    assert.equal(repRes.status, 201);
    const repData = await repRes.json();
    const r01AfterCitizen = repData.roads.find((r: any) => r.id === 'R01');
    assert.equal(r01AfterCitizen.status, 'REPORTED_WATERLOGGING', 'Citizen report must set REPORTED_WATERLOGGING, NEVER CLOSED');

    // 2. Expert road status update requires reason
    const missingReason = await fetch(`${baseUrl}/api/roads/R01/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${expToken}`
      },
      body: JSON.stringify({ status: 'CLOSED' })
    });
    assert.equal(missingReason.status, 400);

    // 3. Expert verifies report & closes road officially -> excluded from route finder
    const verifyRes = await fetch(`${baseUrl}/api/reports/${repData.report.id}/verify`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${expToken}`
      },
      body: JSON.stringify({
        verificationStatus: 'Verified',
        officialAction: 'close_road',
        reviewNotes: 'Traffic Police barricaded JM Road',
        expiresInHours: 4
      })
    });
    assert.equal(verifyRes.status, 200);
    const verifiedBody = await verifyRes.json();
    const r01Closed = verifiedBody.roads.find((r: any) => r.id === 'R01');
    assert.equal(r01Closed.status, 'CLOSED');

    // 4. Route calculation avoids R01 and returns shortest, fastest, safest + alternatives
    const routeRes = await fetch(`${baseUrl}/api/routes/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startNodeId: 'N_SHIVAJINAGAR',
        targetNodeId: 'N_KOTHRUD',
        lambdaRisk: 1.5,
        vehicleType: 'car'
      })
    });
    assert.equal(routeRes.status, 200);
    const routeData = await routeRes.json();
    assert.ok(routeData.shortest && routeData.fastest && routeData.safest);
    assert.ok(Array.isArray(routeData.alternatives));
    assert.equal(
      routeData.safest.edges.some((e: any) => e.id === 'R01'),
      false,
      'Officially CLOSED road R01 must be excluded from routed paths'
    );

    // 5. Poll voting enforces 1 vote per user per poll
    const polls = await (await fetch(`${baseUrl}/api/polls`)).json();
    assert.ok(Array.isArray(polls) && polls.length > 0);
    const targetPoll = polls[0];
    const firstVote = await fetch(`${baseUrl}/api/polls/${targetPoll.id}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citToken}`
      },
      body: JSON.stringify({ option: targetPoll.options[0] })
    });
    assert.equal(firstVote.status, 200);

    const dupVote = await fetch(`${baseUrl}/api/polls/${targetPoll.id}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citToken}`
      },
      body: JSON.stringify({ option: targetPoll.options[1] || targetPoll.options[0] })
    });
    assert.equal(dupVote.status, 409, 'Duplicate vote by same user must fail with 409 Conflict');
  });
});

test('POST /api/routes/find returns independent metrics, distinguishes shortest/fastest/safest, and updates on closure/hazard', async () => {
  const dbPath = makeTmpDbPath('routing-scenarios');

  await withServer(dbPath, async baseUrl => {
    const expLogin = await (
      await fetch(`${baseUrl}/api/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: 'expert' })
      })
    ).json();
    const expToken = expLogin.token as string;

    // 1. Real O-D pair where all 3 differ: Shivajinagar -> Warje
    const warjeRes = await fetch(`${baseUrl}/api/routes/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startNodeId: 'N_SHIVAJINAGAR',
        targetNodeId: 'N_WARJE',
        lambdaRisk: 1.8,
        vehicleType: 'car'
      })
    });
    assert.equal(warjeRes.status, 200);
    const warjeData = await warjeRes.json();
    const wShort = warjeData.shortest.edges.map((e: any) => e.id).join(',');
    const wFast = warjeData.fastest.edges.map((e: any) => e.id).join(',');
    const wSafe = warjeData.safest.edges.map((e: any) => e.id).join(',');
    assert.notEqual(wShort, wFast, 'Shortest and Fastest must differ for Shivajinagar -> Warje');
    assert.ok(warjeData.fastest.feasible && warjeData.safest.feasible);
    assert.ok(warjeData.alternatives.length >= 2, 'Should return multiple genuine alternative paths');
    assert.ok(warjeData.dataQuality.traffic.sampledSegments <= 12, 'Traffic lookups must be limited to candidate route roads');
    assert.ok(warjeData.dataQuality.traffic.liveSegments <= warjeData.dataQuality.traffic.sampledSegments);
    assert.ok(warjeData.dataQuality.warnings.length >= 2, 'Route output must disclose weather and traffic limitations');

    // 2. Real O-D pair where optimal routes naturally converge (or diverge on hazard): Shivajinagar -> Airport
    const airportRes = await fetch(`${baseUrl}/api/routes/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startNodeId: 'N_SHIVAJINAGAR',
        targetNodeId: 'N_AIRPORT',
        lambdaRisk: 1.8,
        vehicleType: 'car'
      })
    });
    assert.equal(airportRes.status, 200);
    const airportData = await airportRes.json();
    assert.ok(airportData.alternatives.length >= 2);
    // Genuine alternatives must have distinct geometries and metrics
    assert.notEqual(
      airportData.alternatives[0].edges.map((e: any) => e.id).join(','),
      airportData.alternatives[1].edges.map((e: any) => e.id).join(',')
    );

    // 3. Expert marks R38 as VERIFIED_HAZARD -> Safest diverts while Shortest remains distance-optimal.
    const hazRes = await fetch(`${baseUrl}/api/roads/R38/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${expToken}`
      },
      body: JSON.stringify({
        status: 'VERIFIED_HAZARD',
        riskScore: 85,
        reason: 'Heavy Mula backwater near Holkar Bridge'
      })
    });
    assert.equal(hazRes.status, 200);

    const airportHazRes = await fetch(`${baseUrl}/api/routes/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startNodeId: 'N_SHIVAJINAGAR',
        targetNodeId: 'N_AIRPORT',
        lambdaRisk: 1.8,
        vehicleType: 'car'
      })
    });
    const airportHaz = await airportHazRes.json();
    assert.equal(airportHaz.shortest.edges[0].id, 'R38', 'Shortest keeps shortest physical road R38');
    assert.notEqual(airportHaz.safest.edges[0].id, 'R38', 'Safest diverts around high-risk R38');
    assert.equal(airportHaz.shortest.hazardousSegmentCount, 1);
    assert.equal(airportHaz.safest.hazardousSegmentCount, 0);

    // 4. Expert closes R38 officially -> Shortest also diverts and counts 1 closure avoided
    const closeRes = await fetch(`${baseUrl}/api/roads/R38/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${expToken}`
      },
      body: JSON.stringify({
        status: 'CLOSED',
        riskScore: 100,
        reason: 'Holkar Bridge closed due to flooding'
      })
    });
    assert.equal(closeRes.status, 200);

    const airportClosedRes = await fetch(`${baseUrl}/api/routes/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startNodeId: 'N_SHIVAJINAGAR',
        targetNodeId: 'N_AIRPORT',
        lambdaRisk: 1.8,
        vehicleType: 'car'
      })
    });
    const airportClosed = await airportClosedRes.json();
    assert.equal(airportClosed.shortest.edges.some((e: any) => e.id === 'R38'), false);
    assert.equal(airportClosed.shortest.closuresAvoidedCount, 1);
  });
});

