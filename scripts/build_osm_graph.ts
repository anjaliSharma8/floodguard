/**
 * SankatSetu — OSM Graph Builder
 *
 * Converts raw Overpass API OSM data (pune_roads_raw.json) into a directed road graph
 * in the SankatSetu GeoJSON schema (roads.json format).
 *
 * Process:
 * 1. Load raw OSM ways + nodes from cache
 * 2. Build intersection node dictionary
 * 3. Split ways at intersections to create proper directed edges
 * 4. Classify road attributes (speed, type, one-way, etc.)
 * 5. Snap to known named nodes where close enough
 * 6. Output roads.json and coverage report
 *
 * Data source: OpenStreetMap Contributors (ODbL)
 * Attribution: © OpenStreetMap contributors
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---- Types ----

interface OSMNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OSMWay {
  type: 'way';
  id: number;
  nodes: number[];
  geometry: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: (OSMNode | OSMWay)[];
  osm3s?: { timestamp_osm_base: string };
}

type RoadType = 'trunk' | 'primary' | 'secondary' | 'tertiary';
type AccessRestriction = 'all_vehicles' | 'no_heavy_vehicles' | 'emergency_only';
type DrainageCondition = 'good' | 'moderate' | 'poor' | 'clogged' | 'unknown';

interface GraphNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sector: string;
  elevationM: number | null;
  osmNodeId?: number;
}

interface GraphEdgeFeature {
  type: 'Feature';
  id: string;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [lng, lat] GeoJSON format
  };
  properties: {
    road_id: string;
    road_name: string;
    from_node: string;
    to_node: string;
    road_type: RoadType;
    distance_km: number;
    estimated_speed_kmph: number;
    base_elevation_m: number | null;
    slope_pct: number | null;
    drainage_condition: DrainageCondition;
    access_restriction: AccessRestriction;
    one_way: boolean;
    is_bridge: boolean;
    is_tunnel: boolean;
    surface: string;
    has_historical_flood: boolean;
    waterway_proximity: string | null;
    geometry_source: string;
    osm_way_id?: number;
    osm_from_node?: number;
    osm_to_node?: number;
  };
}

interface RoadsGeoJSON {
  type: 'FeatureCollection';
  metadata: {
    region: string;
    road_source: string;
    elevation_source: string;
    extracted_at: string;
    osm_data_timestamp: string;
    osm_attribution: string;
    bbox: { south: number; west: number; north: number; east: number };
    nodes_count: number;
    edges_count: number;
    nodes: Record<string, GraphNode>;
    import_notes: string;
  };
  features: GraphEdgeFeature[];
}

// ---- Named Nodes from compile_citywide_network.ts (preserved) ----
// These are the 69 named intersection nodes that existing UI/routing expects.
// We preserve these IDs so existing routes, DB records, and tests all continue working.
const NAMED_NODES: GraphNode[] = [
  // Central Pune
  { id: 'N_SHIVAJINAGAR', name: 'Shivajinagar (Sancheti Chowk)', lat: 18.5314, lng: 73.8446, sector: 'Central Pune', elevationM: 564 },
  { id: 'N_DECCAN', name: 'Deccan Gymkhana (Goodluck Chowk)', lat: 18.5186, lng: 73.8378, sector: 'Central Pune', elevationM: 573 },
  { id: 'N_FC_ROAD', name: 'FC Road (Fergusson College Main Gate)', lat: 18.5230, lng: 73.8415, sector: 'Central Pune', elevationM: 572 },
  { id: 'N_JM_ROAD', name: 'JM Road (Balgandharva Chowk)', lat: 18.5255, lng: 73.8488, sector: 'Central Pune', elevationM: 565 },
  { id: 'N_SWARGATE', name: 'Swargate (Jedhe Chowk)', lat: 18.5018, lng: 73.8580, sector: 'Central Pune', elevationM: 555 },
  { id: 'N_CAMP', name: 'Camp (MG Road / Pulgate)', lat: 18.5142, lng: 73.8796, sector: 'Camp-Cantonment', elevationM: 576 },
  { id: 'N_PUNE_STN', name: 'Pune Railway Station', lat: 18.5289, lng: 73.8744, sector: 'Station-Camp', elevationM: 566 },
  { id: 'N_SADASHIV_PETH', name: 'Sadashiv Peth (Perugate Chowk)', lat: 18.5105, lng: 73.8502, sector: 'Old Pune Peths', elevationM: 568 },
  { id: 'N_NARAYAN_PETH', name: 'Narayan Peth (Kesari Wada)', lat: 18.5170, lng: 73.8505, sector: 'Old Pune Peths', elevationM: 561 },
  { id: 'N_SHANIWAR_PETH', name: 'Shaniwar Peth (Shaniwar Wada)', lat: 18.5195, lng: 73.8553, sector: 'Old Pune Peths', elevationM: 563 },
  { id: 'N_KASBA_PETH', name: 'Kasba Peth (Kasba Ganpati)', lat: 18.5185, lng: 73.8585, sector: 'Old Pune Peths', elevationM: 561 },
  { id: 'N_KOREGAON_PARK', name: 'Koregaon Park (North Main Road)', lat: 18.5362, lng: 73.8940, sector: 'Koregaon Park', elevationM: 565 },
  { id: 'N_KALYANI_NAGAR', name: 'Kalyani Nagar (Bishop School Rd)', lat: 18.5482, lng: 73.9034, sector: 'Kalyani Nagar', elevationM: 557 },
  { id: 'N_BUND_GARDEN', name: 'Bund Garden / Sangam Bridge', lat: 18.5364, lng: 73.8812, sector: 'Mula-Mutha Confluence', elevationM: 553 },
  // West Pune
  { id: 'N_KOTHRUD', name: 'Kothrud (Karve Statue)', lat: 18.5024, lng: 73.8095, sector: 'Kothrud', elevationM: 583 },
  { id: 'N_NAL_STOP', name: 'Nal Stop (Karve Road)', lat: 18.5078, lng: 73.8292, sector: 'Erandwane', elevationM: 572 },
  { id: 'N_KARVE_NAGAR', name: 'Karve Nagar (Cummins College Chowk)', lat: 18.4895, lng: 73.8185, sector: 'Karve Nagar', elevationM: 580 },
  { id: 'N_WARJE', name: 'Warje Flyover Junction', lat: 18.4864, lng: 73.8035, sector: 'Warje', elevationM: 578 },
  { id: 'N_BAVDHAN', name: 'Bavdhan Chowk', lat: 18.5140, lng: 73.7745, sector: 'Bavdhan', elevationM: 598 },
  { id: 'N_CHANDANI', name: 'Chandani Chowk (Paud Rd / NH48)', lat: 18.5082, lng: 73.7825, sector: 'Bavdhan-Kothrud', elevationM: 591 },
  { id: 'N_BANER', name: 'Baner Balewadi Phata', lat: 18.5590, lng: 73.7868, sector: 'Baner', elevationM: 573 },
  { id: 'N_BALEWADI', name: 'Balewadi High Street', lat: 18.5720, lng: 73.7725, sector: 'Balewadi', elevationM: 578 },
  { id: 'N_AUNDH', name: 'Aundh Parihar Chowk', lat: 18.5620, lng: 73.8050, sector: 'Aundh', elevationM: 568 },
  { id: 'N_PASHAN', name: 'Pashan Sus Road Junction', lat: 18.5435, lng: 73.7924, sector: 'Pashan', elevationM: 580 },
  { id: 'N_SUS', name: 'Sus Gaon / Pashan-Sus Link', lat: 18.5480, lng: 73.7550, sector: 'Sus', elevationM: 592 },
  { id: 'N_HINJAWADI', name: 'Hinjawadi IT Park Phase 1', lat: 18.5890, lng: 73.7180, sector: 'Hinjawadi', elevationM: 591 },
  { id: 'N_WAKAD', name: 'Wakad Bridge (NH48)', lat: 18.5980, lng: 73.7650, sector: 'Wakad', elevationM: 581 },
  { id: 'N_UNIV_CIRCLE', name: 'Pune University Circle', lat: 18.5529, lng: 73.8270, sector: 'Ganeshkhind', elevationM: 574 },
  // East Pune
  { id: 'N_HADAPSAR', name: 'Hadapsar Gadital', lat: 18.5011, lng: 73.9261, sector: 'Hadapsar', elevationM: 547 },
  { id: 'N_MAGARPATTA', name: 'Magarpatta City (Tower Bridge)', lat: 18.5135, lng: 73.9242, sector: 'Hadapsar-Magarpatta', elevationM: 548 },
  { id: 'N_AMANORA', name: 'Amanora Town Centre', lat: 18.5180, lng: 73.9350, sector: 'Hadapsar-Amanora', elevationM: 548 },
  { id: 'N_KHARADI', name: 'Kharadi Bypass (EON Free Zone)', lat: 18.5515, lng: 73.9410, sector: 'Kharadi', elevationM: 549 },
  { id: 'N_VIMAN_NAGAR', name: 'Viman Nagar (Nagar Rd)', lat: 18.5679, lng: 73.9143, sector: 'Viman Nagar', elevationM: 554 },
  { id: 'N_YERAWADA', name: 'Yerawada Gunjan Chowk', lat: 18.5529, lng: 73.8797, sector: 'Yerawada', elevationM: 557 },
  { id: 'N_DHANORI', name: 'Dhanori Tingre Nagar Junction', lat: 18.5860, lng: 73.8870, sector: 'Dhanori', elevationM: 553 },
  { id: 'N_AIRPORT', name: 'Lohegaon Airport Junction', lat: 18.5822, lng: 73.9197, sector: 'Lohegaon', elevationM: 556 },
  { id: 'N_WAGHOLI', name: 'Wagholi (Pune-Nagar Highway)', lat: 18.5808, lng: 73.9787, sector: 'Wagholi', elevationM: 553 },
  { id: 'N_MUNDHWA', name: 'Mundhwa Bridge / Keshav Nagar Phata', lat: 18.5325, lng: 73.9250, sector: 'Mundhwa', elevationM: 547 },
  { id: 'N_KESHAV_NAGAR', name: 'Keshav Nagar (Mundhwa-Manjari Rd)', lat: 18.5280, lng: 73.9420, sector: 'Keshav Nagar', elevationM: 548 },
  // South Pune
  { id: 'N_DHANKAWADI', name: 'Dhankawadi (Chavan Nagar)', lat: 18.4710, lng: 73.8560, sector: 'Dhankawadi', elevationM: 571 },
  { id: 'N_BIBWEWADI', name: 'Bibwewadi / Market Yard', lat: 18.4806, lng: 73.8648, sector: 'Bibwewadi', elevationM: 560 },
  { id: 'N_KATRAJ', name: 'Katraj Chowk (NH48)', lat: 18.4520, lng: 73.8520, sector: 'Katraj', elevationM: 578 },
  { id: 'N_KONDHWA', name: 'Kondhwa (Lullanagar / Khadi Machine)', lat: 18.4780, lng: 73.8890, sector: 'Kondhwa', elevationM: 561 },
  { id: 'N_UNDRI', name: 'Undri Chowk (Corinthians Club Link)', lat: 18.4610, lng: 73.9110, sector: 'Undri', elevationM: 570 },
  { id: 'N_WANOWRIE', name: 'Wanowrie (Command Hospital / Fatima Nagar)', lat: 18.5020, lng: 73.8960, sector: 'Wanowrie', elevationM: 558 },
  { id: 'N_NIBM', name: 'NIBM Road Junction', lat: 18.4840, lng: 73.9010, sector: 'NIBM', elevationM: 571 },
  { id: 'N_PISOLI', name: 'Pisoli Katraj-Mantarwadi Link', lat: 18.4480, lng: 73.9160, sector: 'Pisoli', elevationM: 594 },
  { id: 'N_AMBEGAON', name: 'Ambegaon Budruk (Katraj-Navale Bridge Link)', lat: 18.4550, lng: 73.8320, sector: 'Ambegaon', elevationM: 579 },
  { id: 'N_SINHAGAD_RD', name: 'Sinhagad Road (Anand Nagar / Ekta Nagari)', lat: 18.4968, lng: 73.8214, sector: 'Sinhagad Road', elevationM: 581 },
  { id: 'N_DHAYARI', name: 'Dhayari Phata (Sinhagad Rd)', lat: 18.4638, lng: 73.8166, sector: 'Dhayari', elevationM: 591 },
  // PCMC
  { id: 'N_PIMPRI', name: 'Pimpri Chowk (PCMC Bhavan)', lat: 18.6279, lng: 73.8131, sector: 'Pimpri', elevationM: 557 },
  { id: 'N_CHINCHWAD', name: 'Chinchwad Station (Elpro Mall / Chaphekar Chowk)', lat: 18.6420, lng: 73.7850, sector: 'Chinchwad', elevationM: 572 },
  { id: 'N_AKURDI', name: 'Akurdi Railway Station / Khandoba Mal', lat: 18.6496, lng: 73.7707, sector: 'Akurdi', elevationM: 581 },
  { id: 'N_NIGDI', name: 'Nigdi Bhakti Shakti Chowk', lat: 18.6518, lng: 73.7659, sector: 'Nigdi', elevationM: 585 },
  { id: 'N_PRADHIKARAN', name: 'Nigdi Pradhikaran (Sector 24)', lat: 18.6560, lng: 73.7580, sector: 'Pradhikaran', elevationM: 584 },
  { id: 'N_BHOSARI', name: 'Bhosari Nashik Phata (Alandi Link)', lat: 18.6242, lng: 73.8355, sector: 'Bhosari', elevationM: 554 },
  { id: 'N_MOSHI', name: 'Moshi Toll Plaza (Pune-Nashik Highway)', lat: 18.6738, lng: 73.8502, sector: 'Moshi', elevationM: 567 },
  { id: 'N_CHIKHALI', name: 'Chikhali Kudalwadi Chowk', lat: 18.6810, lng: 73.8110, sector: 'Chikhali', elevationM: 572 },
  { id: 'N_TALAWADE', name: 'Talawade IT Park (Tower Chowk)', lat: 18.6942, lng: 73.7845, sector: 'Talawade', elevationM: 582 },
  { id: 'N_RAVET', name: 'Ravet Bridge (Expressway Mukai Chowk)', lat: 18.6432, lng: 73.7388, sector: 'Ravet', elevationM: 578 },
  { id: 'N_PUNAWALE', name: 'Punawale Underpass (NH48)', lat: 18.6180, lng: 73.7460, sector: 'Punawale', elevationM: 580 },
  { id: 'N_TATHAWADE', name: 'Tathawade Dange Chowk Road', lat: 18.6110, lng: 73.7550, sector: 'Tathawade', elevationM: 576 },
  { id: 'N_THERGAON', name: 'Thergaon Dange Chowk', lat: 18.6120, lng: 73.7810, sector: 'Thergaon', elevationM: 570 },
  { id: 'N_RAHATANI', name: 'Rahatani Phata (Finolex Chowk Link)', lat: 18.6050, lng: 73.7920, sector: 'Rahatani', elevationM: 568 },
  { id: 'N_PIMPLE_SAUDAGAR', name: 'Pimple Saudagar (Kunal Icon Chowk)', lat: 18.5987, lng: 73.7975, sector: 'Pimple Saudagar', elevationM: 565 },
  { id: 'N_PIMPLE_NILAKH', name: 'Pimple Nilakh (Rakshak Chowk Link)', lat: 18.5840, lng: 73.7880, sector: 'Pimple Nilakh', elevationM: 562 },
  { id: 'N_SANGVI', name: 'Old Sangvi (Pavana Bridge)', lat: 18.5818, lng: 73.8168, sector: 'Sangvi', elevationM: 556 },
  { id: 'N_DAPODI', name: 'Dapodi / Harris Bridge (Old Highway)', lat: 18.5808, lng: 73.8318, sector: 'Dapodi', elevationM: 554 },
  { id: 'N_KASARWADI', name: 'Kasarwadi Railway Station Junction', lat: 18.6050, lng: 73.8240, sector: 'Kasarwadi', elevationM: 558 },
];

// ---- Helpers ----

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Map OSM highway tag to SankatSetu road type */
function classifyRoadType(highway: string): RoadType {
  if (highway.includes('trunk')) return 'trunk';
  if (highway.includes('primary')) return 'primary';
  if (highway.includes('secondary')) return 'secondary';
  return 'tertiary';
}

/** Assign design speed based on road type (IRC urban road guidelines) */
function getDesignSpeed(highway: string, maxspeedTag?: string): number {
  if (maxspeedTag) {
    const parsed = parseInt(maxspeedTag.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed) && parsed > 5 && parsed <= 120) return parsed;
  }
  if (highway.includes('trunk') || highway === 'motorway') return 65;
  if (highway.includes('primary')) return 50;
  if (highway.includes('secondary')) return 40;
  if (highway === 'tertiary' || highway === 'tertiary_link') return 35;
  if (highway === 'unclassified') return 30;
  return 25; // residential / others
}

/** Determine access restriction from OSM tags */
function getAccessRestriction(tags: Record<string, string>): AccessRestriction {
  const hgvTag = tags['hgv'] || tags['goods'] || tags['motorcar'];
  if (hgvTag === 'no' || tags['maxweight']) return 'no_heavy_vehicles';
  if (tags['access'] === 'private' || tags['access'] === 'emergency') return 'emergency_only';
  return 'all_vehicles';
}

/** Get drainage condition from OSM tags (heuristic) */
function getDrainageCondition(tags: Record<string, string>, highway: string): DrainageCondition {
  if (tags['flood_prone'] === 'yes') return 'poor';
  if (highway.includes('trunk') || highway.includes('primary')) return 'good';
  if (highway.includes('secondary')) return 'moderate';
  if (highway === 'residential') return 'moderate';
  return 'unknown';
}

/** Check if road has historical flood risk (OSM tags or heuristic) */
function hasHistoricalFlood(tags: Record<string, string>): boolean {
  return tags['flood_prone'] === 'yes' ||
    tags['hazard'] === 'flood' ||
    (tags['natural'] === 'water' && tags['waterway'] !== undefined);
}

/** Find nearest named node within threshold */
function findNearestNamedNode(lat: number, lng: number, threshold: number = 0.5): GraphNode | null {
  let nearest: GraphNode | null = null;
  let minDist = Infinity;
  for (const node of NAMED_NODES) {
    const d = haversineKm(lat, lng, node.lat, node.lng);
    if (d < minDist && d <= threshold) {
      minDist = d;
      nearest = node;
    }
  }
  return nearest;
}

/** Compute polyline total length in km */
function polylineLength(coords: Array<{ lat: number; lon: number }>): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1].lat, coords[i - 1].lon, coords[i].lat, coords[i].lon);
  }
  return total;
}

/** Build node ID string from OSM node ID */
function osmNodeId(id: number): string {
  return `OSM_${id}`;
}

// ---- Main build logic ----

interface IntersectionIndex {
  nodeIds: Set<number>; // OSM node IDs that appear in 2+ ways (intersections)
}

function buildGraph(data: OverpassResponse): {
  namedNodesUsed: Set<string>;
  osmNodes: Map<number, { lat: number; lon: number }>;
  edges: GraphEdgeFeature[];
  stats: {
    waysProcessed: number;
    edgesCreated: number;
    namedNodesSnapped: number;
    osmOnlyNodes: number;
    invalidSkipped: number;
    oneWayEdges: number;
  };
} {
  const ways = data.elements.filter(e => e.type === 'way') as OSMWay[];
  const osmNodes = new Map<number, { lat: number; lon: number }>();

  // Build node coordinate lookup from way geometries
  for (const way of ways) {
    if (!way.geometry || way.nodes.length !== way.geometry.length) continue;
    for (let i = 0; i < way.nodes.length; i++) {
      const nid = way.nodes[i];
      const geo = way.geometry[i];
      if (!osmNodes.has(nid) && geo) {
        osmNodes.set(nid, { lat: geo.lat, lon: geo.lon });
      }
    }
  }

  // Find intersection nodes (OSM nodes appearing in 2+ ways)
  const nodeDegree = new Map<number, number>();
  for (const way of ways) {
    for (const nid of way.nodes) {
      nodeDegree.set(nid, (nodeDegree.get(nid) ?? 0) + 1);
    }
  }

  // Also treat endpoints as intersections
  const intersectionNodeIds = new Set<number>();
  for (const way of ways) {
    if (way.nodes.length < 2) continue;
    // Endpoints are always intersections
    intersectionNodeIds.add(way.nodes[0]);
    intersectionNodeIds.add(way.nodes[way.nodes.length - 1]);
  }
  for (const [nid, deg] of nodeDegree) {
    if (deg >= 2) intersectionNodeIds.add(nid);
  }

  // Build graph node dictionary:
  // For each intersection node, check if it snaps to a named node (<300m)
  const graphNodeById = new Map<number, GraphNode>();
  const namedNodesUsed = new Set<string>();

  // First, assign named nodes to their nearest intersection node
  for (const namedNode of NAMED_NODES) {
    let bestOsmId: number | null = null;
    let bestDist = 0.4; // 400m threshold for named node snapping
    for (const nid of intersectionNodeIds) {
      const osmPt = osmNodes.get(nid);
      if (!osmPt) continue;
      const d = haversineKm(namedNode.lat, namedNode.lng, osmPt.lat, osmPt.lon);
      if (d < bestDist) {
        bestDist = d;
        bestOsmId = nid;
      }
    }
    if (bestOsmId !== null && !graphNodeById.has(bestOsmId)) {
      graphNodeById.set(bestOsmId, { ...namedNode, osmNodeId: bestOsmId });
      namedNodesUsed.add(namedNode.id);
    }
  }

  // Then add remaining intersection nodes as OSM-id-based nodes
  for (const nid of intersectionNodeIds) {
    if (graphNodeById.has(nid)) continue;
    const osmPt = osmNodes.get(nid);
    if (!osmPt) continue;
    graphNodeById.set(nid, {
      id: osmNodeId(nid),
      name: `OSM Intersection ${nid}`,
      lat: osmPt.lat,
      lng: osmPt.lon,
      sector: 'Pune/PCMC',
      elevationM: null,
      osmNodeId: nid
    });
  }

  // Split each OSM way at intersection nodes and create directed edge segments
  const edges: GraphEdgeFeature[] = [];
  const stats = {
    waysProcessed: 0,
    edgesCreated: 0,
    namedNodesSnapped: 0,
    osmOnlyNodes: 0,
    invalidSkipped: 0,
    oneWayEdges: 0
  };

  let edgeCounter = 0;

  for (const way of ways) {
    const tags = way.tags || {};
    const highway = tags['highway'] || 'tertiary';

    // Skip pedestrian/cycling-only ways
    if (['footway', 'cycleway', 'path', 'steps', 'pedestrian', 'track'].includes(highway)) {
      stats.invalidSkipped++;
      continue;
    }
    if (tags['access'] === 'no' || tags['motor_vehicle'] === 'no') {
      stats.invalidSkipped++;
      continue;
    }

    if (!way.geometry || way.nodes.length < 2 || way.geometry.length < 2) {
      stats.invalidSkipped++;
      continue;
    }

    const isOneWay = tags['oneway'] === 'yes' ||
      tags['oneway'] === '1' ||
      highway === 'motorway' ||
      highway === 'motorway_link';
    const isReversed = tags['oneway'] === '-1' || tags['oneway'] === 'reverse';

    const isBridge = tags['bridge'] === 'yes' || tags['bridge'] === '1';
    const isTunnel = tags['tunnel'] === 'yes' || tags['tunnel'] === '1';
    const surface = tags['surface'] || 'asphalt';
    const roadName = tags['name'] || tags['ref'] || highway.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const roadType = classifyRoadType(highway);
    const speed = getDesignSpeed(highway, tags['maxspeed']);
    const accessRestriction = getAccessRestriction(tags);
    const drainage = getDrainageCondition(tags, highway);
    const floodRisk = hasHistoricalFlood(tags);

    // Find intersection split points in this way
    const splitPoints: number[] = [0];
    for (let i = 1; i < way.nodes.length - 1; i++) {
      if (intersectionNodeIds.has(way.nodes[i])) {
        splitPoints.push(i);
      }
    }
    splitPoints.push(way.nodes.length - 1);

    stats.waysProcessed++;

    // Create a segment edge for each pair of consecutive split points
    for (let s = 0; s < splitPoints.length - 1; s++) {
      const startIdx = splitPoints[s];
      const endIdx = splitPoints[s + 1];

      const startOsmId = way.nodes[startIdx];
      const endOsmId = way.nodes[endIdx];

      const startGraphNode = graphNodeById.get(startOsmId);
      const endGraphNode = graphNodeById.get(endOsmId);

      if (!startGraphNode || !endGraphNode) {
        stats.invalidSkipped++;
        continue;
      }

      if (startGraphNode.id === endGraphNode.id) continue; // self-loop

      // Extract geometry for this segment
      const segGeom = way.geometry.slice(startIdx, endIdx + 1);
      if (segGeom.length < 2) continue;

      const distKm = Math.round(polylineLength(segGeom) * 1000) / 1000;
      if (distKm < 0.001) continue; // Skip negligibly short segments

      const slopePct = segGeom.length >= 2
        ? null // elevation requires DEM lookup; leave null for now
        : null;

      // GeoJSON: [lng, lat] order
      const geoCoords: [number, number][] = segGeom.map(pt => [pt.lon, pt.lat]);

      edgeCounter++;
      const edgeId = `OSM_E${edgeCounter}`;

      const fromId = isReversed ? endGraphNode.id : startGraphNode.id;
      const toId = isReversed ? startGraphNode.id : endGraphNode.id;
      const edgeCoords: [number, number][] = isReversed ? [...geoCoords].reverse() : geoCoords;

      const feature: GraphEdgeFeature = {
        type: 'Feature',
        id: edgeId,
        geometry: {
          type: 'LineString',
          coordinates: edgeCoords
        },
        properties: {
          road_id: edgeId,
          road_name: roadName,
          from_node: fromId,
          to_node: toId,
          road_type: roadType,
          distance_km: distKm,
          estimated_speed_kmph: speed,
          base_elevation_m: null,
          slope_pct: slopePct,
          drainage_condition: drainage,
          access_restriction: accessRestriction,
          one_way: isOneWay || isReversed,
          is_bridge: isBridge,
          is_tunnel: isTunnel,
          surface,
          has_historical_flood: floodRisk,
          waterway_proximity: tags['waterway'] ? tags['waterway'] : null,
          geometry_source: 'OpenStreetMap via Overpass API (ODbL)',
          osm_way_id: way.id,
          osm_from_node: isReversed ? endOsmId : startOsmId,
          osm_to_node: isReversed ? startOsmId : endOsmId
        }
      };

      edges.push(feature);
      stats.edgesCreated++;
      if (isOneWay || isReversed) stats.oneWayEdges++;

      // Add reverse edge for bidirectional roads
      if (!isOneWay && !isReversed) {
        edgeCounter++;
        const revId = `OSM_E${edgeCounter}`;
        const revFeature: GraphEdgeFeature = {
          type: 'Feature',
          id: revId,
          geometry: {
            type: 'LineString',
            coordinates: [...edgeCoords].reverse()
          },
          properties: {
            ...feature.properties,
            road_id: revId,
            from_node: toId,
            to_node: fromId,
            one_way: false
          }
        };
        edges.push(revFeature);
        stats.edgesCreated++;
      }
    }
  }

  stats.namedNodesSnapped = namedNodesUsed.size;
  stats.osmOnlyNodes = graphNodeById.size - namedNodesUsed.size;

  return { namedNodesUsed, osmNodes, edges, stats };
}

function main() {
  const osmDir = path.join(ROOT, 'datasets', 'osm');
  const rawPath = path.join(osmDir, 'pune_roads_raw.json');
  const metaPath = path.join(osmDir, 'pune_import_meta.json');
  const outputPath = path.join(ROOT, 'src', 'data', 'roads.json');
  const reportPath = path.join(osmDir, 'coverage_report.json');

  if (!fs.existsSync(rawPath)) {
    console.error(`[OSM Build] Raw OSM data not found at: ${rawPath}`);
    console.error(`[OSM Build] Run 'npx tsx scripts/fetch_osm_pune.ts' first.`);
    process.exit(1);
  }

  console.log(`[OSM Build] Loading raw OSM data from: ${rawPath}`);
  const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf-8')) as OverpassResponse;
  const importMeta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    : {};

  const ways = rawData.elements.filter(e => e.type === 'way') as OSMWay[];
  console.log(`[OSM Build] Processing ${ways.length} OSM ways...`);

  const { namedNodesUsed, edges, stats } = buildGraph(rawData);

  console.log(`[OSM Build] Build complete:`);
  console.log(`  Ways processed: ${stats.waysProcessed}`);
  console.log(`  Edges created: ${stats.edgesCreated}`);
  console.log(`  Named nodes snapped: ${stats.namedNodesSnapped}/${NAMED_NODES.length}`);
  console.log(`  OSM-only nodes: ${stats.osmOnlyNodes}`);
  console.log(`  One-way edges: ${stats.oneWayEdges}`);
  console.log(`  Invalid/skipped: ${stats.invalidSkipped}`);

  // Build graph node dictionary (all named nodes + OSM nodes used in edges)
  const usedNodeIds = new Set<string>();
  for (const edge of edges) {
    usedNodeIds.add(edge.properties.from_node);
    usedNodeIds.add(edge.properties.to_node);
  }

  // Named nodes dictionary
  const nodesDict: Record<string, GraphNode> = {};
  for (const node of NAMED_NODES) {
    nodesDict[node.id] = node;
  }

  // Add OSM-only nodes that are referenced in edges
  const rawWays = rawData.elements.filter(e => e.type === 'way') as OSMWay[];
  const allOsmNodeCoords = new Map<number, { lat: number; lon: number }>();
  for (const way of rawWays) {
    if (!way.geometry) continue;
    for (let i = 0; i < way.nodes.length; i++) {
      if (way.geometry[i]) {
        allOsmNodeCoords.set(way.nodes[i], { lat: way.geometry[i].lat, lon: way.geometry[i].lon });
      }
    }
  }

  for (const nodeId of usedNodeIds) {
    if (nodesDict[nodeId]) continue; // already a named node
    if (nodeId.startsWith('OSM_')) {
      const osmId = parseInt(nodeId.replace('OSM_', ''), 10);
      const coords = allOsmNodeCoords.get(osmId);
      if (coords) {
        // Check if this node snaps to a named node
        const nearby = findNearestNamedNode(coords.lat, coords.lon, 0.4);
        if (nearby && !nodesDict[nearby.id]) {
          nodesDict[nearby.id] = nearby;
        } else {
          nodesDict[nodeId] = {
            id: nodeId,
            name: `Intersection ${nodeId}`,
            lat: coords.lat,
            lng: coords.lon,
            sector: 'Pune/PCMC',
            elevationM: null
          };
        }
      }
    }
  }

  const osmTimestamp = importMeta.osmTimestamp || rawData.osm3s?.timestamp_osm_base || 'unknown';
  const extractedAt = new Date().toISOString();

  // Build output GeoJSON
  const output: RoadsGeoJSON = {
    type: 'FeatureCollection',
    metadata: {
      region: 'Pune Metropolitan Region & Pimpri-Chinchwad, Maharashtra, India',
      road_source: 'OpenStreetMap Contributors (ODbL License) via Overpass API',
      elevation_source: 'OpenStreetMap elevation tags (partial) — DEM lookup pending',
      extracted_at: extractedAt,
      osm_data_timestamp: osmTimestamp,
      osm_attribution: '© OpenStreetMap contributors | https://www.openstreetmap.org/copyright | License: ODbL',
      bbox: { south: 18.30, west: 73.58, north: 18.80, east: 74.12 },
      nodes_count: Object.keys(nodesDict).length,
      edges_count: edges.length,
      nodes: nodesDict,
      import_notes: `Real OSM data fetched from Overpass API on ${extractedAt}. ` +
        `OSM timestamp: ${osmTimestamp}. ` +
        `${stats.namedNodesSnapped}/${NAMED_NODES.length} named nodes snapped to real OSM intersections. ` +
        `${stats.edgesCreated} directed road edges from ${stats.waysProcessed} OSM ways.`
    },
    features: edges
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`[OSM Build] ✓ roads.json written: ${Object.keys(nodesDict).length} nodes, ${edges.length} edges`);
  console.log(`[OSM Build]   Path: ${outputPath}`);

  // Write coverage report
  const report = {
    generatedAt: extractedAt,
    osmTimestamp,
    attribution: '© OpenStreetMap contributors',
    bbox: { south: 18.30, west: 73.58, north: 18.80, east: 74.12 },
    totalNodes: Object.keys(nodesDict).length,
    namedNodes: stats.namedNodesSnapped,
    osmOnlyNodes: stats.osmOnlyNodes,
    totalEdges: edges.length,
    oneWayEdges: stats.oneWayEdges,
    bidirectionalEdges: edges.length - stats.oneWayEdges,
    waysProcessed: stats.waysProcessed,
    skippedWays: stats.invalidSkipped,
    namedNodeCoverage: NAMED_NODES.map(n => ({
      id: n.id,
      name: n.name,
      sector: n.sector,
      snapped: namedNodesUsed.has(n.id)
    })),
    sectorCoverage: Object.values(nodesDict).reduce((acc, n) => {
      acc[n.sector || 'Unknown'] = (acc[n.sector || 'Unknown'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  };

  fs.mkdirSync(osmDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[OSM Build] ✓ Coverage report: ${reportPath}`);

  // Warn about unsnapped named nodes
  const unsnapped = NAMED_NODES.filter(n => !namedNodesUsed.has(n.id));
  if (unsnapped.length > 0) {
    console.warn(`[OSM Build] ⚠ ${unsnapped.length} named nodes not snapped to OSM intersections (may be < 400m from any way endpoint):`);
    for (const n of unsnapped) console.warn(`  - ${n.id}: ${n.name}`);
  }

  console.log(`[OSM Build] Complete. Run 'npx tsc --noEmit' to verify types.`);
}

main();
