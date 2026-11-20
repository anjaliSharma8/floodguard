import { PUNE_MONITORING_STATIONS } from '../data/puneData';
import { getLiveRainfallFeed, clearWeatherCache, recomputeRoadRisksFromTelemetry } from '../services/weatherService';
import { calculateFloodRisk } from '../utils/rules';
import { PUNE_ROAD_NODES, INITIAL_ROAD_SEGMENTS } from '../data/puneData';

async function runAudit() {
  console.log('=====================================================');
  console.log('SANKETSETU REAL-TIME WEATHER & TELEMETRY AUDIT');
  console.log('=====================================================\n');

  // Item 1: Verify IMD_API_KEY absence handling
  const imdKey = process.env.IMD_API_KEY?.trim();
  console.log(`[1] IMD_API_KEY Configuration: ${imdKey ? 'Present' : 'Not configured (Empty / Missing)'}`);

  // Item 2: Test live API queries for monitoring stations
  console.log(`\n[2] Testing Open-Meteo Real-Time Telemetry for all ${PUNE_MONITORING_STATIONS.length} stations:`);
  clearWeatherCache();
  const startTime = Date.now();
  const liveFeed = await getLiveRainfallFeed(true);
  const durationMs = Date.now() - startTime;

  console.log(`  Feed Status: ${liveFeed.openMeteoStatus}`);
  console.log(`  IMD Feed Status: ${liveFeed.imdApiStatus}`);
  console.log(`  IMD Advisory Note: ${liveFeed.imdNote}`);
  console.log(`  Last Successful Update: ${liveFeed.lastSuccessfulUpdate}`);
  console.log(`  Network Query Duration: ${durationMs}ms`);

  let liveSuccessCount = 0;
  for (const obs of liveFeed.observations) {
    console.log(`\n  Station: [${obs.stationId}] ${obs.stationName}`);
    console.log(`    Coordinates: (${obs.lat}, ${obs.lng})`);
    console.log(`    Available: ${obs.isAvailable}`);
    console.log(`    Status / Data Type: ${obs.dataType}`);
    console.log(`    Observed Past 24h: ${obs.observedPast24hMm !== null ? `${obs.observedPast24hMm} mm` : 'Unavailable'}`);
    console.log(`    Current Hour: ${obs.currentHourMm !== null ? `${obs.currentHourMm} mm` : 'Unavailable'}`);
    console.log(`    Forecast Next 24h: ${obs.forecastNext24hMm !== null ? `${obs.forecastNext24hMm} mm` : 'Unavailable'}`);
    console.log(`    Timestamp: ${obs.timestamp}`);
    console.log(`    Source: ${obs.source}`);
    if (obs.isAvailable) liveSuccessCount++;
  }

  console.log(`\n  Summary: ${liveSuccessCount} / ${liveFeed.observations.length} stations returned live telemetry.`);

  // Item 4: Test Cache & TTL behavior
  console.log('\n[3] Testing In-Memory Caching & Stale-Data Handling:');
  const cachedFeed = await getLiveRainfallFeed(false);
  const cacheHit = cachedFeed.lastSuccessfulUpdate === liveFeed.lastSuccessfulUpdate;
  console.log(`  Cache Hit (no redundant network hit): ${cacheHit}`);

  // Item 5: Ensure IMD data honesty
  console.log('\n[4] Verifying IMD Telemetry Honesty (zero fabricated numbers):');
  const hasFabricatedImd = liveFeed.observations.some(o => o.source.includes('IMD') && o.isAvailable && !imdKey);
  console.log(`  Are any readings falsely labeled as verified IMD when key is missing? ${hasFabricatedImd ? 'FAIL' : 'PASS (Strictly labeled as Open-Meteo or Unavailable)'}`);

  // Item 6: Verify flood risk calculations consume rainfall data
  console.log('\n[5] Verifying Flood Risk Engine reacts to Live vs High Rainfall:');
  const baselineRisk = calculateFloodRisk({
    rainfallMm: 0,
    elevationM: 550,
    slopePct: 1.0,
    drainageCondition: 'poor',
    hasHistoricalFlood: true
  });
  const highRainRisk = calculateFloodRisk({
    rainfallMm: 95,
    elevationM: 550,
    slopePct: 1.0,
    drainageCondition: 'poor',
    hasHistoricalFlood: true
  });
  console.log(`  Risk @ 0 mm rain: ${baselineRisk.riskScore}/100 (${baselineRisk.category})`);
  console.log(`  Risk @ 95 mm rain: ${highRainRisk.riskScore}/100 (${highRainRisk.category})`);
  console.log(`  Rain factor increases score: ${highRainRisk.riskScore! > baselineRisk.riskScore! ? 'PASS' : 'FAIL'}`);

  // Item 7: Verify road network risk recalculation from telemetry
  console.log('\n[6] Verifying Road Graph Enrichment from Live Telemetry:');
  const updatedRoads = recomputeRoadRisksFromTelemetry(
    INITIAL_ROAD_SEGMENTS.slice(0, 5),
    PUNE_ROAD_NODES,
    liveFeed.observations,
    []
  );
  for (const r of updatedRoads) {
    console.log(`  Road ${r.id} (${r.name}): Risk=${r.riskScore ?? 'Unknown'}/100, Status=${r.status}, Confidence=${r.confidenceScore}`);
  }

  console.log('\n=====================================================');
  console.log('AUDIT COMPLETE');
  console.log('=====================================================');
}

runAudit().catch(err => {
  console.error('Audit script failed:', err);
});
