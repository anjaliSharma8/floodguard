
import type { TrafficFeedStatus } from '../types';

export interface TrafficSpeedData {
  roadId: string;
  currentSpeedKmph: number;
  freeFlowSpeedKmph: number;
  congestionLevelPct: number;
  confidence: number;
  isLive: boolean;
  source: string;
  lastUpdated: string;
}

const TRAFFIC_CACHE_TTL_MS = 3 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_CONCURRENT_REQUESTS = 5;

const cachedSpeeds = new Map<
  string,
  { data: TrafficSpeedData; cachedAt: number }
>();

let liveRequestsInProgress = 0;
let lastSuccessfulLiveUpdate: string | null = null;
let lastLiveRequestAt: string | null = null;

function getApiKey(): string | undefined {
  return process.env.TOMTOM_API_KEY?.trim()
    || process.env.TRAFFIC_API_KEY?.trim()
    || undefined;
}

export function getFallbackSpeedByRoadType(
  roadType: 'trunk' | 'primary' | 'secondary' | 'tertiary',
  designSpeed?: number
): number {
  if (designSpeed && Number.isFinite(designSpeed) && designSpeed > 0) {
    return designSpeed;
  }

  switch (roadType) {
    case 'trunk': return 65;
    case 'primary': return 40;
    case 'secondary': return 35;
    default: return 30;
  }
}

async function fetchTomTomFlow(
  lat: number,
  lng: number,
  apiKey: string
): Promise<{
  currentSpeed: number;
  freeFlowSpeed: number;
  confidence: number;
} | null> {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 || lat > 90 ||
    lng < -180 || lng > 180
  ) {
    return null;
  }

  const url =
    `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json` +
    `?point=${lat},${lng}&unit=KMPH&key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      flowSegmentData?: {
        currentSpeed?: number;
        freeFlowSpeed?: number;
        confidence?: number;
      };
    };

    const flow = data.flowSegmentData;

    if (
      !flow ||
      typeof flow.currentSpeed !== 'number' ||
      !Number.isFinite(flow.currentSpeed) ||
      flow.currentSpeed < 0
    ) {
      return null;
    }

    const freeFlowSpeed =
      typeof flow.freeFlowSpeed === 'number' &&
        Number.isFinite(flow.freeFlowSpeed) &&
        flow.freeFlowSpeed > 0
        ? flow.freeFlowSpeed
        : flow.currentSpeed;

    return {
      currentSpeed: Math.max(0, flow.currentSpeed),
      freeFlowSpeed: Math.max(1, freeFlowSpeed),
      confidence:
        typeof flow.confidence === 'number'
          ? Math.max(0, Math.min(1, flow.confidence))
          : 0.5
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function makeFallback(
  roadId: string,
  roadType: 'trunk' | 'primary' | 'secondary' | 'tertiary',
  baseSpeed: number
): TrafficSpeedData {
  const speed = getFallbackSpeedByRoadType(roadType, baseSpeed);

  return {
    roadId,
    currentSpeedKmph: speed,
    freeFlowSpeedKmph: speed,
    congestionLevelPct: 0,
    confidence: 0.4,
    isLive: false,
    source: 'Estimated road-class baseline; live traffic unavailable',
    lastUpdated: new Date().toISOString()
  };
}

export async function getSegmentTrafficSpeed(
  roadId: string,
  roadType: 'trunk' | 'primary' | 'secondary' | 'tertiary',
  baseSpeed: number,
  coordinates?: [number, number][]
): Promise<TrafficSpeedData> {
  const now = Date.now();

  const midpoint =
    coordinates && coordinates.length > 0
      ? coordinates[Math.floor(coordinates.length / 2)]
      : undefined;

  // Expected coordinate format: [latitude, longitude]
  const lat = midpoint?.[0];
  const lng = midpoint?.[1];

  const cacheKey = `${roadId}:${lat ?? 'na'}:${lng ?? 'na'}`;
  const cached = cachedSpeeds.get(cacheKey);

  if (cached && now - cached.cachedAt < TRAFFIC_CACHE_TTL_MS) {
    return cached.data;
  }

  const apiKey = getApiKey();

  if (
    apiKey &&
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    liveRequestsInProgress < MAX_CONCURRENT_REQUESTS
  ) {
    lastLiveRequestAt = new Date().toISOString();
    liveRequestsInProgress++;

    try {
      const live = await fetchTomTomFlow(lat, lng, apiKey);

      if (live) {
        const congestion = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((live.freeFlowSpeed - live.currentSpeed) /
                live.freeFlowSpeed) * 100
            )
          )
        );

        const result: TrafficSpeedData = {
          roadId,
          currentSpeedKmph: live.currentSpeed,
          freeFlowSpeedKmph: live.freeFlowSpeed,
          congestionLevelPct: congestion,
          confidence: live.confidence,
          isLive: true,
          source: 'TomTom Live Traffic Flow API',
          lastUpdated: new Date().toISOString()
        };

        lastSuccessfulLiveUpdate = result.lastUpdated;
        cachedSpeeds.set(cacheKey, { data: result, cachedAt: Date.now() });

        return result;
      }
    } finally {
      liveRequestsInProgress--;
    }
  }

  const fallback = makeFallback(roadId, roadType, baseSpeed);
  cachedSpeeds.set(cacheKey, { data: fallback, cachedAt: Date.now() });

  return fallback;
}

export function getTrafficFeedStatus(): TrafficFeedStatus {
  const apiKey = getApiKey();
  const activeCachedSpeeds = [...cachedSpeeds.values()].filter(
    cached => Date.now() - cached.cachedAt < TRAFFIC_CACHE_TTL_MS
  );
  const liveSegments = activeCachedSpeeds.filter(
    cached => cached.data.isLive
  ).length;
  const lastSuccessMs = lastSuccessfulLiveUpdate
    ? Date.parse(lastSuccessfulLiveUpdate)
    : Number.NaN;
  const hasRecentSuccess =
    Number.isFinite(lastSuccessMs) &&
    Date.now() - lastSuccessMs < TRAFFIC_CACHE_TTL_MS;
  const hasCachedLiveData = liveSegments > 0;

  return {
    provider: 'TomTom Traffic Flow API / Estimated Baseline',
    isLiveActive: hasRecentSuccess && hasCachedLiveData,
    lastChecked: lastLiveRequestAt,
    lastSuccessfulUpdate: lastSuccessfulLiveUpdate,
    liveSegments,
    cachedSegments: activeCachedSpeeds.length,
    coverageSector: 'Pune & PCMC Metropolitan Area',
    message: hasRecentSuccess && hasCachedLiveData
      ? `Recent TomTom responses are cached for ${liveSegments} road segments. Last successful update: ${lastSuccessfulLiveUpdate}.`
      : !apiKey
        ? 'TomTom API key is not configured. Estimated road-class speeds are being used.'
        : lastLiveRequestAt
          ? 'TomTom API key is configured, but no recent live traffic request has succeeded. Estimated road-class speeds are being used.'
          : 'TomTom API key is configured, but no live traffic request has been made yet.'
  };
}

export function clearTrafficCache(): void {
  cachedSpeeds.clear();
  lastSuccessfulLiveUpdate = null;
  lastLiveRequestAt = null;
}
