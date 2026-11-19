import { PUNE_MONITORING_STATIONS } from '../data/puneData';
import {
  CommunityReport,
  RainfallFeedMetadata,
  RainfallObservation,
  RoadNode,
  RoadSegment
} from '../types';
import { calculateFloodRisk, haversineKm } from '../utils/rules';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

let cachedWeatherFeed: RainfallFeedMetadata | null = null;
let cachedAtMs = 0;

interface OpenMeteoForecastResponse {
  current?: {
    time?: string;
    precipitation?: number;
    rain?: number;
  };
  hourly?: {
    time?: string[];
    precipitation?: number[];
    rain?: number[];
  };
}

function sumWindow(values: number[] | undefined, startIdx: number, endIdx: number): number | null {
  if (!values || values.length === 0) return null;
  const slice = values.slice(Math.max(0, startIdx), Math.min(values.length, endIdx));
  if (slice.length === 0) return null;
  const sum = slice.reduce((acc, v) => acc + (typeof v === 'number' && !Number.isNaN(v) ? v : 0), 0);
  return Math.round(sum * 10) / 10;
}

async function fetchOpenMeteoForStation(
  station: { stationId: string; stationName: string; lat: number; lng: number }
): Promise<RainfallObservation> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${station.lat}&longitude=${station.lng}` +
    `&current=precipitation,rain&hourly=precipitation,rain` +
    `&past_days=1&forecast_days=1&timezone=Asia%2FKolkata`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SanketSetu-Pune-FloodRisk/1.0' }
    });
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }
    const data = (await res.json()) as OpenMeteoForecastResponse;

    const times = data.hourly?.time || [];
    const precip = data.hourly?.precipitation || [];
    const currentTimeStr = data.current?.time || new Date().toISOString().slice(0, 13);
    const currentHourPrefix = currentTimeStr.slice(0, 13);
    let currentIdx = times.findIndex(t => t.startsWith(currentHourPrefix));
    if (currentIdx === -1) {
      currentIdx = Math.min(24, Math.max(0, times.length - 1));
    }

    const observedPast24hMm = sumWindow(precip, Math.max(0, currentIdx - 24), currentIdx + 1);
    const forecastNext24hMm = sumWindow(precip, currentIdx + 1, currentIdx + 25);
    const currentHourMm =
      typeof data.current?.precipitation === 'number'
        ? Math.round(data.current.precipitation * 10) / 10
        : (typeof precip[currentIdx] === 'number' ? Math.round(precip[currentIdx] * 10) / 10 : null);

    return {
      stationId: station.stationId,
      stationName: station.stationName,
      lat: station.lat,
      lng: station.lng,
      observedPast24hMm,
      currentHourMm,
      forecastNext24hMm,
      durationHrs: 24,
      source: 'Open-Meteo Real-Time Weather API (ICON/GFS/ECMWF Blend)',
      resolution: '~11 km hourly grid',
      dataType: 'OBSERVED_RECENT',
      timestamp: new Date().toISOString(),
      isAvailable: true
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getLiveRainfallFeed(forceRefresh = false): Promise<RainfallFeedMetadata> {
  const now = Date.now();
  if (!forceRefresh && cachedWeatherFeed && now - cachedAtMs < CACHE_TTL_MS) {
    return cachedWeatherFeed;
  }

  const imdKey = process.env.IMD_API_KEY?.trim();
  const imdApiStatus: RainfallFeedMetadata['imdApiStatus'] = imdKey ? 'CONFIGURED' : 'KEY_MISSING';
  const imdNote = imdKey
    ? 'IMD_API_KEY configured; Open-Meteo remains primary continuous gridded rainfall feed.'
    : 'Official IMD AWS live API key (IMD_API_KEY) is not configured. Using live Open-Meteo observed/forecast precipitation; IMD station telemetry is marked unavailable rather than fabricated.';

  try {
    const settled = await Promise.allSettled(
      PUNE_MONITORING_STATIONS.map(st => fetchOpenMeteoForStation(st))
    );

    const observations: RainfallObservation[] = settled.map((result, idx) => {
      const station = PUNE_MONITORING_STATIONS[idx];
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        stationId: station.stationId,
        stationName: station.stationName,
        lat: station.lat,
        lng: station.lng,
        observedPast24hMm: null,
        currentHourMm: null,
        forecastNext24hMm: null,
        durationHrs: 24,
        source: 'Open-Meteo Real-Time Weather API',
        resolution: '~11 km hourly grid',
        dataType: 'UNAVAILABLE',
        timestamp: new Date().toISOString(),
        isAvailable: false
      };
    });

    const anySuccess = observations.some(o => o.isAvailable);
    const feed: RainfallFeedMetadata = {
      lastSuccessfulUpdate: anySuccess
        ? new Date().toISOString()
        : (cachedWeatherFeed?.lastSuccessfulUpdate ?? null),
      openMeteoStatus: anySuccess ? 'OK' : 'UNAVAILABLE',
      imdApiStatus,
      imdNote,
      observations
    };

    cachedWeatherFeed = feed;
    cachedAtMs = now;
    return feed;
  } catch {
    return {
      lastSuccessfulUpdate: cachedWeatherFeed?.lastSuccessfulUpdate ?? null,
      openMeteoStatus: 'UNAVAILABLE',
      imdApiStatus,
      imdNote,
      observations: PUNE_MONITORING_STATIONS.map(st => ({
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
      }))
    };
  }
}

export function clearWeatherCache(): void {
  cachedWeatherFeed = null;
  cachedAtMs = 0;
}

/**
 * Recompute authoritative road segment risk scores from live rainfall telemetry,
 * terrain, drainage, historical floods, and active community reports.
 * Preserves explicit expert road closures unless expired.
 */
export function recomputeRoadRisksFromTelemetry(
  roads: RoadSegment[],
  nodes: Record<string, RoadNode>,
  observations: RainfallObservation[],
  reports: CommunityReport[]
): RoadSegment[] {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  return roads.map((road) => {
    const midCoord = road.coordinates[Math.floor(road.coordinates.length / 2)] || [
      nodes[road.from]?.lat ?? 18.5204,
      nodes[road.from]?.lng ?? 73.8567
    ];

    // Nearest available rainfall station
    let nearestObs: RainfallObservation | null = null;
    let bestDist = Infinity;
    for (const obs of observations) {
      if (!obs.isAvailable) continue;
      const d = haversineKm(midCoord[0], midCoord[1], obs.lat, obs.lng);
      if (d < bestDist) {
        bestDist = d;
        nearestObs = obs;
      }
    }

    // Active reports referencing this road (exclude Rejected/Resolved)
    const activeRoadReports = reports.filter(
      r => r.roadId === road.id && r.verificationStatus !== 'Rejected' && r.verificationStatus !== 'Resolved'
    );

    let communityRiskScore: number | null = null;
    let hasVerifiedCommunityHazard = false;

    if (activeRoadReports.length > 0) {
      let maxRepScore = 0;
      for (const r of activeRoadReports) {
        const base =
          r.severity === 'Critical' ? 92 :
          r.severity === 'High' ? 75 :
          r.severity === 'Moderate' ? 50 : 25;
        const verifMultiplier = r.verificationStatus === 'Verified' ? 1.0 : 0.7;
        maxRepScore = Math.max(maxRepScore, base * verifMultiplier);
        if (r.verificationStatus === 'Verified') {
          hasVerifiedCommunityHazard = true;
        }
      }
      communityRiskScore = Math.round(Math.min(100, maxRepScore));
    } else if (road.hasHistoricalFlood) {
      communityRiskScore = 20;
    }

    // Check if an explicit expert closure / verified hazard has expired
    let currentStatus = road.status;
    let statusReason = road.statusReason;
    let expiresAt = road.expiresAt;
    if (expiresAt && Date.parse(expiresAt) <= nowMs) {
      currentStatus = activeRoadReports.length > 0 ? 'REPORTED_WATERLOGGING' : 'OPEN';
      statusReason = 'Previous closure/advisory expired automatically';
      expiresAt = null;
    }

    const effectiveRainMm = nearestObs
      ? Math.max(nearestObs.observedPast24hMm ?? 0, (nearestObs.currentHourMm ?? 0) * 6)
      : null;

    const risk = calculateFloodRisk({
      rainfallMm: effectiveRainMm,
      durationHrs: 24,
      rainfallTimestamp: nearestObs?.timestamp ?? null,
      elevationM: road.baseElevationM,
      slopePct: road.slopePct,
      drainageCondition: road.drainageCondition,
      hasHistoricalFlood: road.hasHistoricalFlood,
      communityRiskScore,
      hasVerifiedCommunityHazard,
      referenceTimeMs: nowMs
    });

    // Preserve explicit CLOSED or VERIFIED_HAZARD set by expert; otherwise derive honestly
    if (currentStatus !== 'CLOSED' && currentStatus !== 'VERIFIED_HAZARD') {
      if (activeRoadReports.some(r => r.verificationStatus === 'Verified')) {
        currentStatus = 'VERIFIED_HAZARD';
      } else if (activeRoadReports.length > 0) {
        currentStatus = 'REPORTED_WATERLOGGING';
      } else if (risk.riskScore === null) {
        currentStatus = 'UNKNOWN';
      } else {
        currentStatus = 'OPEN';
      }
    }

    return {
      ...road,
      riskScore: risk.riskScore,
      riskCategory: risk.category,
      confidenceScore: risk.confidenceScore,
      status: currentStatus,
      statusReason,
      expiresAt,
      lastUpdated: nowIso
    };
  });
}
