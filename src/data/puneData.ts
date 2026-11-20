import roadsGeoJson from './roads.json' with { type: 'json' };
import {
  RoadNode,
  RoadSegment,
  Shelter,
  Hospital,
  EmergencyFacility,
  CommunityReport,
  LivePoll,
  HistoricalFlood,
  WaterwayFeature
} from '../types';
import { calculateFloodRisk } from '../utils/rules';

interface GeoJsonRoadFeature {
  type: string;
  id: string;
  geometry: {
    type: string;
    coordinates: [number, number][]; // [lng, lat]
  };
  properties: {
    road_id: string;
    road_name: string;
    from_node: string;
    to_node: string;
    road_type: 'trunk' | 'primary' | 'secondary' | 'tertiary';
    distance_km: number;
    estimated_speed_kmph: number;
    base_elevation_m: number | null;
    midpoint_elevation_m?: number | null;
    slope_pct: number | null;
    drainage_condition: 'good' | 'moderate' | 'poor' | 'clogged' | 'unknown';
    access_restriction: 'all_vehicles' | 'no_heavy_vehicles' | 'emergency_only';
    one_way: boolean;
    is_bridge?: boolean;
    is_tunnel?: boolean;
    surface?: string;
    has_historical_flood: boolean;
    waterway_proximity?: string | null;
    geometry_source?: string;
  };
}

const rawGeo = roadsGeoJson as unknown as {
  metadata: {
    extracted_at: string;
    nodes: Record<string, RoadNode>;
  };
  features: GeoJsonRoadFeature[];
};

export const PUNE_ROAD_NODES: Record<string, RoadNode> = rawGeo.metadata.nodes;

export const INITIAL_ROAD_SEGMENTS: RoadSegment[] = rawGeo.features.map((feat) => {
  const p = feat.properties;
  // Convert GeoJSON [lng, lat] -> Leaflet [lat, lng]
  const leafletCoords: [number, number][] = feat.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

  // Compute honest baseline risk without pretending live rainfall telemetry yet (rainfallMm: null until weather feed resolves)
  const baseline = calculateFloodRisk({
    rainfallMm: null,
    elevationM: p.base_elevation_m,
    slopePct: p.slope_pct,
    drainageCondition: p.drainage_condition,
    hasHistoricalFlood: p.has_historical_flood,
    communityRiskScore: null
  });

  return {
    id: p.road_id,
    name: p.road_name,
    from: p.from_node,
    to: p.to_node,
    distanceKm: p.distance_km,
    speedKmph: p.estimated_speed_kmph,
    roadType: p.road_type,
    baseElevationM: p.base_elevation_m,
    slopePct: p.slope_pct,
    drainageCondition: p.drainage_condition,
    isOneWay: Boolean(p.one_way),
    accessRestriction: p.access_restriction || 'all_vehicles',
    isBridge: Boolean(p.is_bridge),
    isTunnel: Boolean(p.is_tunnel),
    surface: p.surface || 'asphalt',
    hasHistoricalFlood: Boolean(p.has_historical_flood),
    waterwayProximity: p.waterway_proximity ?? null,
    riskScore: baseline.riskScore,
    riskCategory: baseline.category,
    confidenceScore: baseline.confidenceScore,
    status: 'UNKNOWN',
    coordinates: leafletCoords,
    geometrySource: p.geometry_source || 'OpenStreetMap via OSRM',
    lastUpdated: rawGeo.metadata.extracted_at
  };
});

export interface MonitoringStationDef {
  stationId: string;
  stationName: string;
  lat: number;
  lng: number;
}

export const PUNE_MONITORING_STATIONS: MonitoringStationDef[] = [
  { stationId: 'PUN_SHIVAJINAGAR', stationName: 'Shivajinagar / Central Pune', lat: 18.5314, lng: 73.8446 },
  { stationId: 'PUN_PASHAN', stationName: 'Pashan / Baner West', lat: 18.5388, lng: 73.7915 },
  { stationId: 'PUN_LOHEGAON', stationName: 'Lohegaon Airport / East Pune', lat: 18.5822, lng: 73.9197 },
  { stationId: 'PCMC_CHINCHWAD', stationName: 'Pimpri-Chinchwad Basin', lat: 18.6298, lng: 73.7997 },
  { stationId: 'PUN_KHADAKWASLA', stationName: 'Khadakwasla / Sinhagad Catchment', lat: 18.4450, lng: 73.7750 },
  { stationId: 'PUN_SWARGATE', stationName: 'Swargate / Katraj South', lat: 18.4806, lng: 73.8580 },
  { stationId: 'PUN_HADAPSAR', stationName: 'Hadapsar / Magarpatta East', lat: 18.5011, lng: 73.9261 },
  { stationId: 'PCMC_BHOSARI', stationName: 'Bhosari / Moshi North PCMC', lat: 18.6242, lng: 73.8355 },
  { stationId: 'PCMC_NIGDI', stationName: 'Nigdi / Talawade Industrial', lat: 18.6518, lng: 73.7659 }
];

export const INITIAL_WATERWAYS: WaterwayFeature[] = [
  {
    id: 'DRN_01',
    name: 'Ambil Odha Natural Nullah',
    waterwayType: 'stream',
    sector: 'Sinhagad Road / Sahakar Nagar',
    lat: 18.4968,
    lng: 73.8214,
    capacityKnown: false,
    reportedCapacityCusecs: null,
    maintenanceNote: 'Natural storm nullah traversing Parvati-Sinhagad basin; historical bottleneck during intense cloudbursts.',
    source: 'OpenStreetMap Waterways & PMC Flood Review'
  },
  {
    id: 'DRN_02',
    name: 'Mutha River Corridor (Bhide / Lakdi / Sangam)',
    waterwayType: 'river',
    sector: 'Deccan - Shivajinagar - Sangam',
    lat: 18.5175,
    lng: 73.8440,
    capacityKnown: false,
    reportedCapacityCusecs: null,
    maintenanceNote: 'Regulated by upstream Khadakwasla Dam discharge; low-lying causeways submerge during heavy release.',
    source: 'OpenStreetMap & Maharashtra Irrigation Dept Reference'
  },
  {
    id: 'DRN_03',
    name: 'Mula-Mutha Confluence & Bund Garden Stretch',
    waterwayType: 'river',
    sector: 'Bund Garden / Yerawada',
    lat: 18.5364,
    lng: 73.8812,
    capacityKnown: false,
    reportedCapacityCusecs: null,
    maintenanceNote: 'Confluence basin receiving combined Mula and Mutha river flows; capacity depends on upstream dam outflow.',
    source: 'OpenStreetMap Waterways'
  },
  {
    id: 'DRN_04',
    name: 'Pavana River Basin (Sangvi - Pimpri - Chinchwad)',
    waterwayType: 'river',
    sector: 'Pimpri-Chinchwad',
    lat: 18.5818,
    lng: 73.8168,
    capacityKnown: false,
    reportedCapacityCusecs: null,
    maintenanceNote: 'Low-lying riparian stretch near Old Sangvi & Dapodi; subject to backwater swelling from Pavana Dam release.',
    source: 'OpenStreetMap & PCMC Flood Zone Reference'
  },
  {
    id: 'DRN_05',
    name: 'Mula River (Aundh - Baner - Wakad)',
    waterwayType: 'river',
    sector: 'Aundh / Baner / Wakad',
    lat: 18.5620,
    lng: 73.8050,
    capacityKnown: false,
    reportedCapacityCusecs: null,
    maintenanceNote: 'Meandering river boundary between Pune & PCMC; approach roads near bridges vulnerable to runoff.',
    source: 'OpenStreetMap Waterways'
  },
  {
    id: 'DRN_06',
    name: 'Nagzari Nullah Corridor',
    waterwayType: 'drain',
    sector: 'Camp / Pune Railway Station',
    lat: 18.5289,
    lng: 73.8744,
    capacityKnown: false,
    reportedCapacityCusecs: null,
    maintenanceNote: 'Urban stormwater nullah; discharge capacity not publicly instrumented in open telemetry.',
    source: 'OpenStreetMap Waterways'
  }
];

export const INITIAL_SHELTERS: Shelter[] = [
  {
    id: 'SH_01',
    name: 'Shivajinagar Relief Community Hall',
    lat: 18.5320,
    lng: 73.8460,
    capacity: 250,
    currentOccupancy: 40,
    petFriendly: true,
    wheelchairAccessible: true,
    contact: '+91-20-25501001',
    address: 'Ghole Road, Shivajinagar, Pune',
    lastUpdated: '2026-10-30T08:30:00Z'
  },
  {
    id: 'SH_02',
    name: 'Kothrud Municipal Sports Complex',
    lat: 18.5080,
    lng: 73.8070,
    capacity: 500,
    currentOccupancy: 85,
    petFriendly: true,
    wheelchairAccessible: true,
    contact: '+91-20-25442010',
    address: 'Near Chandani Chowk Rd, Kothrud',
    lastUpdated: '2026-10-30T08:30:00Z'
  },
  {
    id: 'SH_03',
    name: 'Sinhagad Road Flood Rescue Shelter (Dhayari)',
    lat: 18.4750,
    lng: 73.8180,
    capacity: 350,
    currentOccupancy: 120,
    petFriendly: false,
    wheelchairAccessible: true,
    contact: '+91-20-24358890',
    address: 'Vadgaon Budruk, Sinhagad Road',
    lastUpdated: '2026-10-30T08:30:00Z'
  },
  {
    id: 'SH_04',
    name: 'Swargate Multipurpose Relief Center',
    lat: 18.5020,
    lng: 73.8590,
    capacity: 300,
    currentOccupancy: 60,
    petFriendly: true,
    wheelchairAccessible: false,
    contact: '+91-20-24443211',
    address: 'Jedhe Chowk, Swargate',
    lastUpdated: '2026-10-30T08:30:00Z'
  },
  {
    id: 'SH_05',
    name: 'Pimpri PCMC Disaster Relief Shelter',
    lat: 18.6280,
    lng: 73.8150,
    capacity: 450,
    currentOccupancy: 75,
    petFriendly: true,
    wheelchairAccessible: true,
    contact: '+91-20-27425555',
    address: 'Near PCMC Bhavan, Pimpri',
    lastUpdated: '2026-10-30T08:30:00Z'
  },
  {
    id: 'SH_06',
    name: 'Yerawada Community Flood Sanctuary',
    lat: 18.5530,
    lng: 73.8890,
    capacity: 200,
    currentOccupancy: 30,
    petFriendly: false,
    wheelchairAccessible: true,
    contact: '+91-20-26681020',
    address: 'Airport Road Junction, Yerawada',
    lastUpdated: '2026-10-30T08:30:00Z'
  },
  {
    id: 'SH_07',
    name: 'Hadapsar Magarpatta Relief Center',
    lat: 18.5050,
    lng: 73.9310,
    capacity: 400,
    currentOccupancy: 50,
    petFriendly: true,
    wheelchairAccessible: true,
    contact: '+91-20-26870020',
    address: 'Solapur Road, Hadapsar, Pune',
    lastUpdated: '2026-10-30T08:30:00Z'
  },
  {
    id: 'SH_08',
    name: 'Baner-Balewadi Sports Complex Shelter',
    lat: 18.5680,
    lng: 73.7750,
    capacity: 600,
    currentOccupancy: 90,
    petFriendly: true,
    wheelchairAccessible: true,
    contact: '+91-20-27290044',
    address: 'Shiv Chhatrapati Sports Complex, Balewadi',
    lastUpdated: '2026-10-30T08:30:00Z'
  },
  {
    id: 'SH_09',
    name: 'Bhosari PCMC Multipurpose Hall',
    lat: 18.6250,
    lng: 73.8410,
    capacity: 350,
    currentOccupancy: 45,
    petFriendly: false,
    wheelchairAccessible: true,
    contact: '+91-20-27122001',
    address: 'Alandi Road, Bhosari, PCMC',
    lastUpdated: '2026-10-30T08:30:00Z'
  },
  {
    id: 'SH_10',
    name: 'Nigdi Pradhikaran Community Center',
    lat: 18.6530,
    lng: 73.7620,
    capacity: 300,
    currentOccupancy: 20,
    petFriendly: true,
    wheelchairAccessible: true,
    contact: '+91-20-27651122',
    address: 'Sector 24, Pradhikaran, Nigdi',
    lastUpdated: '2026-10-30T08:30:00Z'
  }
];

export const INITIAL_HOSPITALS: Hospital[] = [
  {
    id: 'HOSP_01',
    name: 'Sassoon General Hospital & BJ Medical College',
    type: 'Government Tertiary Hospital',
    lat: 18.5262,
    lng: 73.8729,
    contact: '+91-20-26128000',
    totalBeds: 1296,
    availableIcu: 42,
    hasTraumaCenter: true
  },
  {
    id: 'HOSP_02',
    name: 'Ruby Hall Clinic',
    type: 'Multispeciality Hospital',
    lat: 18.5332,
    lng: 73.8798,
    contact: '+91-20-66455100',
    totalBeds: 550,
    availableIcu: 28,
    hasTraumaCenter: true
  },
  {
    id: 'HOSP_03',
    name: 'Deenanath Mangeshkar Hospital (Erandwane)',
    type: 'Tertiary Care Hospital',
    lat: 18.5028,
    lng: 73.8294,
    contact: '+91-20-40151000',
    totalBeds: 800,
    availableIcu: 35,
    hasTraumaCenter: true
  },
  {
    id: 'HOSP_04',
    name: 'KEM Hospital Pune (Rasta Peth)',
    type: 'Trust Hospital',
    lat: 18.5190,
    lng: 73.8682,
    contact: '+91-20-26061000',
    totalBeds: 550,
    availableIcu: 22,
    hasTraumaCenter: true
  },
  {
    id: 'HOSP_05',
    name: 'YCM Hospital (Yashwantrao Chavan Memorial, Pimpri)',
    type: 'Municipal Government Hospital',
    lat: 18.6255,
    lng: 73.8190,
    contact: '+91-20-27422501',
    totalBeds: 750,
    availableIcu: 30,
    hasTraumaCenter: true
  },
  {
    id: 'HOSP_06',
    name: 'Sahyadri Super Speciality Hospital (Deccan)',
    type: 'Multispeciality Hospital',
    lat: 18.5160,
    lng: 73.8340,
    contact: '+91-20-67213000',
    totalBeds: 200,
    availableIcu: 15,
    hasTraumaCenter: true
  },
  {
    id: 'HOSP_07',
    name: 'Aditya Birla Memorial Hospital (Thergaon / Chinchwad)',
    type: 'Super Speciality Hospital',
    lat: 18.6200,
    lng: 73.7820,
    contact: '+91-20-30717500',
    totalBeds: 500,
    availableIcu: 32,
    hasTraumaCenter: true
  },
  {
    id: 'HOSP_08',
    name: 'Noble Hospital (Hadapsar)',
    type: 'Multispeciality Hospital',
    lat: 18.5040,
    lng: 73.9315,
    contact: '+91-20-66285000',
    totalBeds: 350,
    availableIcu: 20,
    hasTraumaCenter: true
  },
  {
    id: 'HOSP_09',
    name: 'Jupiter Hospital Pune (Baner)',
    type: 'Tertiary Care Hospital',
    lat: 18.5610,
    lng: 73.7840,
    contact: '+91-20-27992211',
    totalBeds: 380,
    availableIcu: 25,
    hasTraumaCenter: true
  },
  {
    id: 'HOSP_10',
    name: 'Manipal Hospital (Kharadi)',
    type: 'Multispeciality Hospital',
    lat: 18.5520,
    lng: 73.9380,
    contact: '+91-20-61656666',
    totalBeds: 300,
    availableIcu: 18,
    hasTraumaCenter: true
  }
];

export const INITIAL_EMERGENCY_FACILITIES: EmergencyFacility[] = [
  {
    id: 'EM_01',
    name: 'PMC Disaster Control',
    aliases: [
      'PMC Disaster Management Control Room',
      'Pune Municipal Corporation Disaster Control',
      'PMC',
      'Disaster control',
      'Control room',
      'पीएमसी आपत्ती नियंत्रण',
      'पुणे आपत्ती नियंत्रण कक्ष',
      'पीएमसी आपदा नियंत्रण'
    ],
    type: 'Disaster Control',
    lat: 18.5308,
    lng: 73.8553,
    contact: '+91-20-25501269',
    specialization: 'Central Command, Dam Release Alerts & River Basin Sirens',
    serviceHours: '24x7'
  },
  {
    id: 'EM_02',
    name: 'Central Fire & Water Rescue',
    aliases: [
      'Central Fire Brigade HQ',
      'Fire brigade',
      'Fire and rescue',
      'Fire and water rescue',
      'Fire rescue',
      'अग्निशमन दल',
      'अग्निशमन',
      'आग आणि बचाव'
    ],
    type: 'Fire & Rescue',
    lat: 18.5110,
    lng: 73.8640,
    contact: '101 / +91-20-26451707',
    specialization: 'Inflatable Rafts, High Water Evacuation & Tree Clearance',
    serviceHours: '24x7'
  },
  {
    id: 'EM_03',
    name: 'NDRF 5th Battalion (Talegaon Post)',
    aliases: [
      'NDRF',
      'NDRF 5th Battalion',
      'एनडीआरएफ',
      'एनडीआरएफ पाचवी बटालियन'
    ],
    type: 'NDRF Post',
    lat: 18.7200,
    lng: 73.6800,
    contact: '1070 / +91-20-24328888',
    specialization: 'Deep Flood Rescue, Amphibious Vehicles & Swift Water Crews',
    serviceHours: '24x7'
  },
  {
    id: 'EM_04',
    name: 'RESQ Animal Flood Rescue',
    aliases: [
      'RESQ Charitable Trust Animal Rescue Center',
      'RESQ',
      'Animal rescue',
      'Animal rescue centre',
      'पशु बचाव',
      'प्राणी बचाव',
      'जनावरांची मदत'
    ],
    type: 'Animal Rescue',
    lat: 18.5280,
    lng: 73.7480,
    contact: '+91-9890999111',
    specialization: 'Wildlife & Domestic Animals, Large-Animal Flooding Ambulances',
    serviceHours: '24x7'
  },
  {
    id: 'EM_07',
    name: 'Emergency Ambulance',
    aliases: [
      'Ambulance',
      '108',
      'एम्बुलेंस',
      'रुग्णवाहिका',
      'अॅम्ब्युलन्स'
    ],
    type: 'Ambulance',
    contact: '108 (Toll Free)',
    specialization: 'Emergency ambulance helpline',
    serviceHours: '24x7'
  },
  {
    id: 'EM_08',
    name: 'PCMC Control Room',
    aliases: [
      'PCMC Disaster Control',
      'PCMC',
      'Pimpri Chinchwad Municipal Corporation Control Room',
      'Control room',
      'पीसीएमसी नियंत्रण कक्ष',
      'पिंपरी चिंचवड नियंत्रण कक्ष'
    ],
    type: 'Disaster Control',
    contact: '+91-20-67333333',
    specialization: 'Pimpri, Chinchwad, Bhosari',
    serviceHours: '24x7'
  },
  {
    id: 'EM_05',
    name: 'SPCA Pune & Veterinary Clinic',
    aliases: [
      'SPCA',
      'Veterinary clinic',
      'पशु चिकित्सालय',
      'पशुवैद्यकीय दवाखाना'
    ],
    type: 'Veterinary',
    lat: 18.5080,
    lng: 73.8520,
    contact: '+91-20-24440022',
    specialization: 'Small Animal Triage, Kennels for Displaced Pets',
    serviceHours: '08:00 - 20:00'
  },
  {
    id: 'EM_06',
    name: 'Bodhisattva Animal Rescue Clinic (Kothrud)',
    aliases: [
      'Bodhisattva Animal Rescue',
      'Animal rescue',
      'बोधिसत्व पशु बचाव',
      'बोधिसत्त्व प्राणी बचाव'
    ],
    type: 'Animal Rescue',
    lat: 18.5040,
    lng: 73.7990,
    contact: '+91-9158000456',
    specialization: 'Street Dogs, Cats & Birds Emergency Shelter',
    serviceHours: '24x7'
  }
];

export const INITIAL_HISTORICAL_FLOODS: HistoricalFlood[] = [
  {
    id: 'INC_2019_01',
    name: 'Ambil Odha Flash Flood',
    lat: 18.4980,
    lng: 73.8420,
    date: '2019-09-25',
    severity: 'Critical',
    waterLevelM: 2.4,
    roadAffected: 'Sinhagad Road / Aranyeshwar',
    source: 'PMC Disaster Analysis'
  },
  {
    id: 'INC_2019_02',
    name: 'Sinhagad Road Ekta Nagari Inundation',
    lat: 18.4850,
    lng: 73.8210,
    date: '2019-09-26',
    severity: 'Critical',
    waterLevelM: 2.8,
    roadAffected: 'Sinhagad Road Riverside',
    source: 'CWC Flood Bulletins'
  },
  {
    id: 'INC_2021_01',
    name: 'Mutha River Swelling (Bhide Bridge)',
    lat: 18.5175,
    lng: 73.8440,
    date: '2021-07-23',
    severity: 'High',
    waterLevelM: 1.8,
    roadAffected: 'Deccan Riverside Causeway',
    source: 'Irrigation Dept Discharge'
  },
  {
    id: 'INC_2023_01',
    name: 'Pavana River Inundation (Sangvi)',
    lat: 18.5880,
    lng: 73.8120,
    date: '2023-07-19',
    severity: 'High',
    waterLevelM: 1.5,
    roadAffected: 'Old Sangvi Bridge Road',
    source: 'PCMC Incident Log'
  }
];

export const INITIAL_POLLS: LivePoll[] = [
  {
    id: 'POLL_01',
    roadId: 'R08',
    roadName: 'Sinhagad Road (Dandekar Bridge - Anand Nagar)',
    question: 'What is the current waterlogging condition on Sinhagad Road?',
    options: [
      'Completely safe',
      'Minor waterlogging',
      'Heavy waterlogging',
      'Road blocked',
      'Need emergency assistance'
    ],
    votes: {
      'Completely safe': 4,
      'Minor waterlogging': 7,
      'Heavy waterlogging': 5,
      'Road blocked': 2,
      'Need emergency assistance': 0
    },
    totalVotes: 18,
    isActive: true
  },
  {
    id: 'POLL_02',
    roadId: 'R01',
    roadName: 'Fergusson College (FC) Road',
    question: 'How is the passability on FC Road right now?',
    options: [
      'Completely safe',
      'Minor waterlogging',
      'Heavy waterlogging',
      'Road blocked',
      'Need emergency assistance'
    ],
    votes: {
      'Completely safe': 12,
      'Minor waterlogging': 3,
      'Heavy waterlogging': 0,
      'Road blocked': 0,
      'Need emergency assistance': 0
    },
    totalVotes: 15,
    isActive: true
  },
  {
    id: 'POLL_03',
    roadId: 'R31',
    roadName: 'Pavana Bridge Approach (Old Sangvi - Dapodi)',
    question: 'What is the water condition near Old Sangvi / Pavana Bridge?',
    options: [
      'Completely safe',
      'Minor waterlogging',
      'Heavy waterlogging',
      'Road blocked',
      'Need emergency assistance'
    ],
    votes: {
      'Completely safe': 6,
      'Minor waterlogging': 8,
      'Heavy waterlogging': 3,
      'Road blocked': 1,
      'Need emergency assistance': 0
    },
    totalVotes: 18,
    isActive: true
  }
];
