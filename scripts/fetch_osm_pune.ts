/**
 * SankatSetu — Real OSM Road Network Fetcher for Pune & PCMC
 *
 * Fetches actual OpenStreetMap road data via Overpass API for the Pune Metropolitan Region.
 * Covers: Pune City + Pimpri-Chinchwad (PCMC)
 * Geographic boundary: bbox 18.30,73.58,18.80,74.12
 *
 * Data source: OpenStreetMap Contributors (ODbL License)
 * Attribution: © OpenStreetMap contributors | https://www.openstreetmap.org/copyright
 *
 * Usage:
 *   npx tsx scripts/fetch_osm_pune.ts
 *
 * Output:
 *   datasets/osm/pune_roads_raw.json  — raw Overpass JSON (cached)
 *   datasets/osm/pune_import_meta.json — import metadata
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Geographic boundary: Pune Metropolitan Region including PCMC
const PUNE_BBOX = {
  south: 18.30,
  west: 73.58,
  north: 18.80,
  east: 74.12
};

// Overpass API endpoints (try multiple for reliability)
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter'
];

// Road types to import (vehicle-navigable roads only)
const ROAD_TYPES = [
  'motorway', 'motorway_link',
  'trunk', 'trunk_link',
  'primary', 'primary_link',
  'secondary', 'secondary_link',
  'tertiary', 'tertiary_link',
  'unclassified',
  'residential'
];

/**
 * Build Overpass QL query to fetch all vehicle-navigable roads in Pune/PCMC bounding box.
 * Uses [out:json] format and requests ways with geometry.
 */
function buildOverpassQuery(): string {
  const { south, west, north, east } = PUNE_BBOX;
  const bbox = `${south},${west},${north},${east}`;
  const highwayFilter = ROAD_TYPES.map(t => `["highway"="${t}"]`).join('');

  // Query structure:
  // 1. Fetch all way elements matching our highway types within the bbox
  // 2. Recurse down to get all nodes used by these ways
  // 3. Output in JSON with geometry
  const highwayUnion = ROAD_TYPES.map(t =>
    `  way["highway"="${t}"](${bbox});`
  ).join('\n');

  return `[out:json][timeout:180][maxsize:536870912];
(
${highwayUnion}
);
out body geom;
`;
}

interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassWay {
  type: 'way';
  id: number;
  nodes: number[];
  geometry: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  version: number;
  generator: string;
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: (OverpassNode | OverpassWay)[];
}

async function fetchFromOverpass(query: string, endpoint: string): Promise<OverpassResponse> {
  console.log(`[OSM] Trying endpoint: ${endpoint}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000); // 3 min timeout

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SankatSetu-PuneFloodRisk/1.0 (flood emergency routing system; contact=developer)',
        'Accept-Encoding': 'gzip'
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as OverpassResponse;
    console.log(`[OSM] Received ${data.elements?.length ?? 0} elements from Overpass`);
    return data;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function fetchOSMData(): Promise<{ data: OverpassResponse; endpoint: string }> {
  const query = buildOverpassQuery();
  console.log(`[OSM] Overpass query length: ${query.length} chars`);
  console.log(`[OSM] Requesting roads in bbox: ${PUNE_BBOX.south},${PUNE_BBOX.west},${PUNE_BBOX.north},${PUNE_BBOX.east}`);

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = await fetchFromOverpass(query, endpoint);
      return { data, endpoint };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[OSM] Endpoint ${endpoint} failed: ${errMsg}`);
    }
  }

  throw new Error('[OSM] All Overpass API endpoints failed. Check network connectivity.');
}

function main() {
  const osmDir = path.join(ROOT, 'datasets', 'osm');
  fs.mkdirSync(osmDir, { recursive: true });

  const rawOutputPath = path.join(osmDir, 'pune_roads_raw.json');
  const metaOutputPath = path.join(osmDir, 'pune_import_meta.json');

  // Check if cached data exists and is less than 7 days old
  if (fs.existsSync(rawOutputPath)) {
    try {
      const stat = fs.statSync(rawOutputPath);
      const ageMs = Date.now() - stat.mtimeMs;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < 7) {
        const cached = JSON.parse(fs.readFileSync(rawOutputPath, 'utf-8')) as OverpassResponse;
        const wayCount = cached.elements?.filter(e => e.type === 'way').length ?? 0;
        console.log(`[OSM] Using cached OSM data (${ageDays.toFixed(1)} days old, ${wayCount} ways). Delete ${rawOutputPath} to force re-fetch.`);
        return;
      }
      console.log(`[OSM] Cached data is ${ageDays.toFixed(1)} days old — refreshing.`);
    } catch {
      console.log('[OSM] Cache read failed, re-fetching.');
    }
  }

  fetchOSMData().then(({ data, endpoint }) => {
    const ways = data.elements.filter(e => e.type === 'way') as OverpassWay[];
    const nodes = data.elements.filter(e => e.type === 'node') as OverpassNode[];

    console.log(`[OSM] Summary:`);
    console.log(`  Ways: ${ways.length}`);
    console.log(`  Nodes: ${nodes.length}`);
    console.log(`  Timestamp: ${data.osm3s?.timestamp_osm_base ?? 'unknown'}`);
    console.log(`  Endpoint used: ${endpoint}`);

    // Save raw data
    fs.writeFileSync(rawOutputPath, JSON.stringify(data, null, 2));
    console.log(`[OSM] Raw data saved to: ${rawOutputPath}`);

    // Save metadata
    const meta = {
      importedAt: new Date().toISOString(),
      osmTimestamp: data.osm3s?.timestamp_osm_base ?? 'unknown',
      endpoint,
      bbox: PUNE_BBOX,
      roadTypes: ROAD_TYPES,
      wayCounts: ways.length,
      nodeCounts: nodes.length,
      attribution: '© OpenStreetMap contributors | https://www.openstreetmap.org/copyright',
      license: 'Open Database License (ODbL) | https://opendatacommons.org/licenses/odbl/'
    };
    fs.writeFileSync(metaOutputPath, JSON.stringify(meta, null, 2));
    console.log(`[OSM] Import metadata saved to: ${metaOutputPath}`);

    console.log(`[OSM] ✓ OSM data fetch complete. Run 'npx tsx scripts/build_osm_graph.ts' next.`);
  }).catch(err => {
    console.error('[OSM] FATAL:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

main();
