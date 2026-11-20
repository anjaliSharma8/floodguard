
import { PUNE_MONITORING_STATIONS } from '../data/puneData';
import {
  CommunityReport,
  RainfallFeedMetadata,
  RainfallObservation,
  RoadNode,
  RoadSegment
} from '../types';
import { calculateFloodRisk, haversineKm } from '../utils/rules';

const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 7000;

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

interface Coordinates {
  lat: number;
  lng: number;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function sumWindow(
  values: number[] | undefined,
  startIdx: number,
  endIdx: number
): number | null {
  if (!values || values.length === 0) return null;

  const start = Math.max(0, startIdx);
  const end = Math.min(values.length, endIdx);
  const slice = values.slice(start, end);

  if (slice.length === 0) return null;

  const validValues = slice.filter(
    value => typeof value === 'number' && Number.isFinite(value) && value >= 0
  );

  if (validValues.length === 0) return null;

  return roundOne(
    validValues.reduce((total, value) => total + value, 0)
  );
}

/**
 * Pune coordinate order detection.
 *
 * GeoJSON coordinates are [longitude, latitude].
 * Some internal application coordinates may be [latitude, longitude].
 *
 * Pune longitude is approximately 73-74.
 * Pune latitude is approximately 18-19.
 */
function normalizeRoadCoordinate(
  coordinate: number[] | undefined
): Coordinates | null {
  if (!coordinate || coordinate.length < 2) return null;

  const first = coordinate[0];
  const second = coordinate[1];

  if (
    !Number.isFinite(first) ||
    !Number.isFinite(second)
  ) {
    return null;
  }

  // GeoJSON [longitude, latitude]
  if (
    first >= 70 &&
    first <= 80 &&
    second >= 8 &&
    second <= 25
  ) {
    return {
      lat: second,
      lng: first
    };
  }

  // Latitude-longitude [latitude, longitude]
  if (
    first >= 8 &&
    first <= 25 &&
    second >= 70 &&
    second <= 80
  ) {
    return {
      lat: first,
      lng: second
    };
  }

  return null;
}

function getRoadMidpoint(
  road: RoadSegment,
  nodes: Record<string, RoadNode>
): Coordinates {
  const coordinates = road.coordinates ?? [];

  if (coordinates.length > 0) {
    const middleIndex = Math.floor(coordinates.length / 2);

    // Try midpoint first, then other available points.
    const orderedCoordinates = [
      coordinates[middleIndex],
      ...coordinates.filter((_, index) => index !== middleIndex)
    ];

    for (const coordinate of orderedCoordinates) {
      const normalized = normalizeRoadCoordinate(coordinate);

      if (normalized) {
        return normalized;
      }
    }
  }

  // Fallback to the road's starting node.
  const node = nodes[road.from];

  if (
    node &&
    Number.isFinite(node.lat) &&
    Number.isFinite(node.lng)
  ) {
    return {
      lat: node.lat,
      lng: node.lng
    };
  }

  // Last-resort approximate Pune city centre.
  return {
    lat: 18.5204,
    lng: 73.8567
  };
}

async function fetchOpenMeteoForStation(
  station: {
    stationId: string;
    stationName: string;
    lat: number;
    lng: number;
  }
): Promise<RainfallObservation> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${station.lat}` +
    `&longitude=${station.lng}` +
    '&current=precipitation,rain' +
    '&hourly=precipitation,rain' +
    '&past_days=1' +
    '&forecast_days=1' +
    '&timezone=Asia%2FKolkata';

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SanketSetu-Pune-FloodRisk/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP ${response.status}`);
    }

    const data =
      await response.json() as OpenMeteoForecastResponse;

    const times = data.hourly?.time ?? [];
    const precipitation = data.hourly?.precipitation ?? [];

    if (times.length === 0 || precipitation.length === 0) {
      throw new Error('Open-Meteo returned no hourly precipitation data');
    }

    const currentTime =
      data.current?.time ??
      new Date().toISOString().slice(0, 13);

    const currentHourPrefix = currentTime.slice(0, 13);

    let currentIndex = times.findIndex(
      time => time.startsWith(currentHourPrefix)
    );

    if (currentIndex === -1) {
      // Do not silently assume the first hour is the current hour.
      throw new Error('Could not match current time with hourly weather data');
    }

    const observedPast24hMm = sumWindow(
      precipitation,
      Math.max(0, currentIndex - 24),
      currentIndex
    );

    const forecastNext24hMm = sumWindow(
      precipitation,
      currentIndex + 1,
      currentIndex + 25
    );

    const currentHourMm =
      typeof data.current?.precipitation === 'number' &&
        Number.isFinite(data.current.precipitation)
        ? roundOne(Math.max(0, data.current.precipitation))
        : (
          typeof precipitation[currentIndex] === 'number'
            ? roundOne(Math.max(0, precipitation[currentIndex]))
            : null
        );

    return {
      stationId: station.stationId,
      stationName: station.stationName,
      lat: station.lat,
      lng: station.lng,
      observedPast24hMm,
      currentHourMm,
      forecastNext24hMm,
      durationHrs: 24,
      source: 'Open-Meteo Forecast API',
      resolution: '~11 km hourly grid',
      dataType: 'MODEL_ESTIMATE',
      timestamp: new Date().toISOString(),
      isAvailable: true
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createUnavailableObservation(
  station: {
    stationId: string;
    stationName: string;
    lat: number;
    lng: number;
  }
): RainfallObservation {
  return {
    stationId: station.stationId,
    stationName: station.stationName,
    lat: station.lat,
    lng: station.lng,
    observedPast24hMm: null,
    currentHourMm: null,
    forecastNext24hMm: null,
    durationHrs: 24,
    source: 'Open-Meteo Forecast API',
    resolution: '~11 km hourly grid',
    dataType: 'UNAVAILABLE',
    timestamp: new Date().toISOString(),
    isAvailable: false
  };
}

export async function getLiveRainfallFeed(
  forceRefresh = false
): Promise<RainfallFeedMetadata> {
  const now = Date.now();

  if (
    !forceRefresh &&
    cachedWeatherFeed &&
    cachedWeatherFeed.openMeteoStatus === 'OK' &&
    now - cachedAtMs < CACHE_TTL_MS
  ) {
    return cachedWeatherFeed;
  }

  const imdKey = process.env.IMD_API_KEY?.trim();

  const imdApiStatus: RainfallFeedMetadata['imdApiStatus'] =
    imdKey ? 'CONFIGURED' : 'KEY_MISSING';

  const imdNote = imdKey
    ? 'IMD_API_KEY is configured. Open-Meteo remains the active rainfall feed; IMD data is not fetched by this service.'
    : 'IMD_API_KEY is not configured. Open-Meteo is used for gridded precipitation. Direct IMD station telemetry is unavailable.';

  const settled = await Promise.allSettled(
    PUNE_MONITORING_STATIONS.map(station =>
      fetchOpenMeteoForStation(station)
    )
  );

  const observations: RainfallObservation[] =
    settled.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      return createUnavailableObservation(
        PUNE_MONITORING_STATIONS[index]
      );
    });

  const anySuccess = observations.some(
    observation => observation.isAvailable
  );

  const feed: RainfallFeedMetadata = {
    lastSuccessfulUpdate: anySuccess
      ? new Date().toISOString()
      : (cachedWeatherFeed?.lastSuccessfulUpdate ?? null),
    openMeteoStatus: anySuccess ? 'OK' : 'UNAVAILABLE',
    imdApiStatus,
    imdNote,
    observations
  };

  // Cache successful or partially successful results.
  // Do not cache an all-stations-failed response for 15 minutes.
  if (anySuccess) {
    cachedWeatherFeed = feed;
    cachedAtMs = Date.now();
  }

  return feed;
}

export function clearWeatherCache(): void {
  cachedWeatherFeed = null;
  cachedAtMs = 0;
}

/**
 * Recomputes road risk using available gridded rainfall estimates,
 * terrain/drainage attributes and active community reports.
 *
 * Important:
 * - Rainfall is gridded weather data, not street-level waterlogging data.
 * - Forecast rainfall is not treated as past-period rainfall.
 * - Missing rainfall estimates produce an unknown risk score
 *   according to calculateFloodRisk's handling of null rainfall.
 * - Existing expert closures and verified hazards are preserved
 *   until their expiry time.
 */
export function recomputeRoadRisksFromTelemetry(
  roads: RoadSegment[],
  nodes: Record<string, RoadNode>,
  observations: RainfallObservation[],
  reports: CommunityReport[]
): RoadSegment[] {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  return roads.map(road => {
    const midpoint = getRoadMidpoint(road, nodes);

    // Find the nearest available weather grid estimate.
    let nearestObservation: RainfallObservation | null = null;
    let nearestDistanceKm = Infinity;

    for (const observation of observations) {
      if (!observation.isAvailable) continue;

      if (
        !Number.isFinite(observation.lat) ||
        !Number.isFinite(observation.lng)
      ) {
        continue;
      }

      const distance = haversineKm(
        midpoint.lat,
        midpoint.lng,
        observation.lat,
        observation.lng
      );

      if (distance < nearestDistanceKm) {
        nearestDistanceKm = distance;
        nearestObservation = observation;
      }
    }

    // Ignore rejected and resolved reports.
    const activeRoadReports = reports.filter(report =>
      report.roadId === road.id &&
      report.verificationStatus !== 'Rejected' &&
      report.verificationStatus !== 'Resolved'
    );

    let communityRiskScore: number | null = null;
    let hasVerifiedCommunityHazard = false;

    if (activeRoadReports.length > 0) {
      let maximumReportScore = 0;

      for (const report of activeRoadReports) {
        const severityScore =
          report.severity === 'Critical' ? 92 :
            report.severity === 'High' ? 75 :
              report.severity === 'Moderate' ? 50 :
                25;

        const verificationMultiplier =
          report.verificationStatus === 'Verified' ? 1.0 : 0.7;

        maximumReportScore = Math.max(
          maximumReportScore,
          severityScore * verificationMultiplier
        );

        if (report.verificationStatus === 'Verified') {
          hasVerifiedCommunityHazard = true;
        }
      }

      communityRiskScore = Math.round(
        Math.min(100, maximumReportScore)
      );
    } else if (road.hasHistoricalFlood) {
      // Historical flood record is a risk factor, not proof of current flooding.
      communityRiskScore = 20;
    }

    // Preserve current status unless an expiry has passed.
    let currentStatus = road.status;
    let statusReason = road.statusReason;
    let expiresAt = road.expiresAt;

    if (expiresAt && Date.parse(expiresAt) <= nowMs) {
      currentStatus =
        activeRoadReports.length > 0
          ? 'REPORTED_WATERLOGGING'
          : 'OPEN';

      statusReason = 'Previous closure/advisory expired automatically';
      expiresAt = null;
    }

    // Use the past-24-hour estimate; do not multiply current-hour rainfall
    // to invent a 24-hour total.
    const effectiveRainMm = nearestObservation
      ? nearestObservation.observedPast24hMm
      : null;

    const risk = calculateFloodRisk({
      rainfallMm: effectiveRainMm,
      durationHrs: 24,
      rainfallTimestamp: nearestObservation?.timestamp ?? null,
      elevationM: road.baseElevationM,
      slopePct: road.slopePct,
      drainageCondition: road.drainageCondition,
      hasHistoricalFlood: road.hasHistoricalFlood,
      communityRiskScore,
      hasVerifiedCommunityHazard,
      referenceTimeMs: nowMs
    });

    const riskSources = new Set<string>();
    if (nearestObservation?.observedPast24hMm !== null && nearestObservation?.observedPast24hMm !== undefined) {
      riskSources.add(nearestObservation.source);
    }
    if (road.baseElevationM !== null || road.slopePct !== null) {
      riskSources.add('Road terrain attributes');
    }
    if (road.drainageCondition !== 'unknown') {
      riskSources.add('Road drainage attributes');
    }
    riskSources.add(road.hasHistoricalFlood ? 'Historical flood record' : 'Road graph flood-history attribute');
    if (activeRoadReports.length > 0) {
      riskSources.add('Community reports');
    }

    // Preserve explicit expert closure and verified hazard states.
    if (
      currentStatus !== 'CLOSED' &&
      currentStatus !== 'VERIFIED_HAZARD'
    ) {
      if (
        activeRoadReports.some(
          report => report.verificationStatus === 'Verified'
        )
      ) {
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
      riskSources: [...riskSources],
      riskExplanation: risk.explainability,
      riskObservationTimestamp:
        nearestObservation?.observedPast24hMm !== null &&
        nearestObservation?.observedPast24hMm !== undefined
          ? nearestObservation.timestamp
          : undefined,
      riskUpdatedAt: nowIso,
      status: currentStatus,
      statusReason,
      expiresAt,
      lastUpdated: nowIso
    };
  });
}
