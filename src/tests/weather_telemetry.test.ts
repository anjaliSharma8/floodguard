import test from 'node:test';
import assert from 'node:assert/strict';
import { PUNE_MONITORING_STATIONS, PUNE_ROAD_NODES, INITIAL_ROAD_SEGMENTS } from '../data/puneData';
import { getLiveRainfallFeed, clearWeatherCache, recomputeRoadRisksFromTelemetry } from '../services/weatherService';
import { calculateFloodRisk } from '../utils/rules';
import { RainfallObservation } from '../types';

test('WEATHER INTEGRATION: Open-Meteo works without IMD_API_KEY and never fabricates IMD data', async () => {
  clearWeatherCache();
  const feed = await getLiveRainfallFeed(false);

  // 1. IMD_API_KEY absence handling
  assert.equal(feed.imdApiStatus, 'KEY_MISSING');
  assert.ok(feed.imdNote.includes('IMD_API_KEY'));

  // 2. Observations must never be labeled as verified IMD when key is missing
  for (const obs of feed.observations) {
    if (obs.isAvailable) {
      assert.ok(
        obs.source.includes('Open-Meteo'),
        `Station ${obs.stationId} should cite Open-Meteo, not IMD`
      );
    }
  }

  // 3. Stations count matches configured telemetry stations
  assert.equal(feed.observations.length, PUNE_MONITORING_STATIONS.length);
});

test('CACHE BEHAVIOR: In-memory cache returns cached data without redundant requests', async () => {
  clearWeatherCache();
  const first = await getLiveRainfallFeed(false);
  const second = await getLiveRainfallFeed(false);

  assert.equal(first.lastSuccessfulUpdate, second.lastSuccessfulUpdate);
  assert.equal(first.openMeteoStatus, second.openMeteoStatus);

  // Clear cache resets cached timestamp
  clearWeatherCache();
});

test('WEATHER DATA QUALITY: Gridded Open-Meteo rainfall is labeled as an estimate and totals only the requested hourly windows', async () => {
  const originalFetch = globalThis.fetch;
  clearWeatherCache();

  const hourlyTimes = Array.from({ length: 50 }, (_, index) => {
    const time = new Date(Date.UTC(2026, 10, 18, 11 + index));
    return time.toISOString().slice(0, 16);
  });
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount++;
    return new Response(JSON.stringify({
      current: {
        time: hourlyTimes[25],
        precipitation: 1
      },
      hourly: {
        time: hourlyTimes,
        precipitation: Array.from({ length: 50 }, () => 1)
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const feed = await getLiveRainfallFeed(true);
    assert.equal(requestCount, PUNE_MONITORING_STATIONS.length);
    assert.equal(feed.openMeteoStatus, 'OK');
    assert.ok(feed.observations.every(observation => observation.dataType === 'MODEL_ESTIMATE'));
    assert.ok(feed.observations.every(observation => observation.observedPast24hMm === 24));
    assert.ok(feed.observations.every(observation => observation.forecastNext24hMm === 24));
    assert.ok(feed.observations.every(observation => observation.currentHourMm === 1));
  } finally {
    globalThis.fetch = originalFetch;
    clearWeatherCache();
  }
});

test('FLOOD RISK ENGINE: Reacts to rainfall dynamically and rejects zero-risk assumption on missing data', () => {
  // Test 1: Increasing rainfall strictly increases risk
  const zeroRain = calculateFloodRisk({
    rainfallMm: 0,
    elevationM: 550,
    slopePct: 1.0,
    drainageCondition: 'moderate',
    hasHistoricalFlood: false
  });

  const heavyRain = calculateFloodRisk({
    rainfallMm: 85,
    elevationM: 550,
    slopePct: 1.0,
    drainageCondition: 'moderate',
    hasHistoricalFlood: false
  });

  assert.ok(zeroRain.riskScore !== null);
  assert.ok(heavyRain.riskScore !== null);
  assert.ok(
    heavyRain.riskScore! > zeroRain.riskScore!,
    `Heavy rain risk (${heavyRain.riskScore}) must exceed zero rain risk (${zeroRain.riskScore})`
  );

  // Test 2: Missing rainfall data does NOT default to 0 risk
  const missingRain = calculateFloodRisk({
    rainfallMm: null,
    elevationM: 550,
    slopePct: 1.0,
    drainageCondition: 'moderate',
    hasHistoricalFlood: false
  });

  assert.ok(missingRain.riskScore !== null);
  assert.ok(
    missingRain.riskScore! > zeroRain.riskScore!,
    'Missing rainfall must use precautionary baseline, not assume dry zero-risk'
  );
  assert.ok(
    missingRain.confidenceScore < zeroRain.confidenceScore,
    'Missing rainfall must lower data confidence score'
  );
  assert.ok(missingRain.missingFactors.includes('rainfall'));
});

test('ROAD ENRICHMENT: Recomputes road segment risk scores and assigns nearest telemetry station', () => {
  // Synthetic telemetry stations: one dry, one extreme cloudburst
  const mockStations: RainfallObservation[] = [
    {
      stationId: 'PUN_SHIVAJINAGAR',
      stationName: 'Shivajinagar',
      lat: 18.5314,
      lng: 73.8446,
      observedPast24hMm: 5.0,
      currentHourMm: 0.5,
      forecastNext24hMm: 10.0,
      durationHrs: 24,
      source: 'Open-Meteo Test Mock',
      resolution: '~11 km',
      dataType: 'OBSERVED_RECENT',
      timestamp: new Date().toISOString(),
      isAvailable: true
    },
    {
      stationId: 'PCMC_CHINCHWAD',
      stationName: 'Chinchwad Basin',
      lat: 18.6298,
      lng: 73.7997,
      observedPast24hMm: 110.0, // High cloudburst in PCMC
      currentHourMm: 25.0,
      forecastNext24hMm: 60.0,
      durationHrs: 24,
      source: 'Open-Meteo Test Mock',
      resolution: '~11 km',
      dataType: 'OBSERVED_RECENT',
      timestamp: new Date().toISOString(),
      isAvailable: true
    }
  ];

  const dryStation: RainfallObservation[] = [
    {
      stationId: 'PUN_SHIVAJINAGAR',
      stationName: 'Shivajinagar',
      lat: 18.5314,
      lng: 73.8446,
      observedPast24hMm: 2.0,
      currentHourMm: 0.0,
      forecastNext24hMm: 5.0,
      durationHrs: 24,
      source: 'Open-Meteo Test Mock',
      resolution: '~11 km',
      dataType: 'OBSERVED_RECENT',
      timestamp: new Date().toISOString(),
      isAvailable: true
    }
  ];

  const delugeStation: RainfallObservation[] = [
    {
      stationId: 'PUN_SHIVAJINAGAR',
      stationName: 'Shivajinagar',
      lat: 18.5314,
      lng: 73.8446,
      observedPast24hMm: 120.0, // High cloudburst
      currentHourMm: 30.0,
      forecastNext24hMm: 60.0,
      durationHrs: 24,
      source: 'Open-Meteo Test Mock',
      resolution: '~11 km',
      dataType: 'OBSERVED_RECENT',
      timestamp: new Date().toISOString(),
      isAvailable: true
    }
  ];

  const dryEnriched = recomputeRoadRisksFromTelemetry(
    INITIAL_ROAD_SEGMENTS.slice(0, 5),
    PUNE_ROAD_NODES,
    dryStation,
    []
  );

  const delugeEnriched = recomputeRoadRisksFromTelemetry(
    INITIAL_ROAD_SEGMENTS.slice(0, 5),
    PUNE_ROAD_NODES,
    delugeStation,
    []
  );

  const dryR01 = dryEnriched.find(r => r.id === 'R01')!;
  const delugeR01 = delugeEnriched.find(r => r.id === 'R01')!;

  assert.ok(dryR01.riskScore !== null);
  assert.ok(delugeR01.riskScore !== null);

  assert.ok(
    delugeR01.riskScore! > dryR01.riskScore!,
    `Deluge risk (${delugeR01.riskScore}) on R01 must exceed dry risk (${dryR01.riskScore})`
  );
  assert.equal(delugeR01.confidenceScore, 1.0, 'Full telemetry gives 1.0 confidence');
  assert.ok(dryR01.riskSources?.includes('Open-Meteo Test Mock'));
  assert.ok(dryR01.riskExplanation?.includes('Rule-based score'));
  assert.equal(dryR01.riskObservationTimestamp, dryStation[0].timestamp);
  assert.ok(dryR01.riskUpdatedAt);
});

test('HONEST FAILURE MODES: Unavailable feed marks stations as unavailable and never fabricates values', () => {
  // Test unavailable station representation
  const unavailableStations: RainfallObservation[] = PUNE_MONITORING_STATIONS.map(st => ({
    stationId: st.stationId,
    stationName: st.stationName,
    lat: st.lat,
    lng: st.lng,
    observedPast24hMm: null,
    currentHourMm: null,
    forecastNext24hMm: null,
    durationHrs: 24,
    source: 'Open-Meteo Real-Time Weather API',
    resolution: '~11 km hourly grid',
    dataType: 'UNAVAILABLE',
    timestamp: new Date().toISOString(),
    isAvailable: false
  }));

  const roads = recomputeRoadRisksFromTelemetry(
    INITIAL_ROAD_SEGMENTS.slice(0, 3),
    PUNE_ROAD_NODES,
    unavailableStations,
    []
  );

  for (const road of roads) {
    // When rainfall telemetry is completely unavailable:
    // 1. Road is still given a precautionary baseline risk (never falsely marked 0)
    assert.ok(road.riskScore !== null);
    // 2. Confidence is appropriately discounted
    assert.ok(road.confidenceScore <= 0.65, `Confidence must be discounted when rain is missing, got ${road.confidenceScore}`);
  }
});
