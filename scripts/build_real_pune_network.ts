import fs from 'node:fs';
import path from 'node:path';

interface NodeDef {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sector: string;
}

interface EdgeDef {
  id: string;
  from: string;
  to: string;
  name: string;
  roadType: 'trunk' | 'primary' | 'secondary' | 'tertiary';
  isOneWay: boolean;
  accessRestriction: 'all_vehicles' | 'no_heavy_vehicles' | 'emergency_only';
  speedLimitKmph: number;
  isBridge?: boolean;
  isTunnel?: boolean;
  surface: 'asphalt' | 'concrete' | 'paved';
  drainageCondition: 'good' | 'moderate' | 'poor' | 'clogged' | 'unknown';
  hasHistoricalFlood: boolean;
  waterwayProximity?: string;
}

const NODES: NodeDef[] = [
  { id: 'N_SHIVAJINAGAR', name: 'Shivajinagar (Sancheti Chowk)', lat: 18.5314, lng: 73.8446, sector: 'Central Pune' },
  { id: 'N_DECCAN', name: 'Deccan Gymkhana (Goodluck Chowk)', lat: 18.5186, lng: 73.8378, sector: 'Central Pune' },
  { id: 'N_NAL_STOP', name: 'Nal Stop (Karve Road)', lat: 18.5078, lng: 73.8292, sector: 'Erandwane' },
  { id: 'N_KOTHRUD', name: 'Kothrud (Karve Statue)', lat: 18.5024, lng: 73.8095, sector: 'Kothrud' },
  { id: 'N_CHANDANI', name: 'Chandani Chowk (Paud Rd / NH48)', lat: 18.5082, lng: 73.7825, sector: 'Bavdhan-Kothrud' },
  { id: 'N_WARJE', name: 'Warje Flyover Junction', lat: 18.4864, lng: 73.8035, sector: 'Warje' },
  { id: 'N_SINHAGAD_RD', name: 'Sinhagad Road (Anand Nagar / Ekta Nagari)', lat: 18.4968, lng: 73.8214, sector: 'Mutha Basin' },
  { id: 'N_DHAYARI', name: 'Dhayari Phata (Sinhagad Rd)', lat: 18.4638, lng: 73.8166, sector: 'Dhayari' },
  { id: 'N_SWARGATE', name: 'Swargate (Jedhe Chowk)', lat: 18.5018, lng: 73.8580, sector: 'Swargate' },
  { id: 'N_BIBWEWADI', name: 'Bibwewadi / Market Yard', lat: 18.4806, lng: 73.8648, sector: 'Bibwewadi' },
  { id: 'N_KATRAJ', name: 'Katraj Chowk', lat: 18.4520, lng: 73.8520, sector: 'Katraj' },
  { id: 'N_PUNE_STN', name: 'Pune Railway Station', lat: 18.5289, lng: 73.8744, sector: 'Station-Camp' },
  { id: 'N_CAMP', name: 'Camp (MG Road / Pulgate)', lat: 18.5142, lng: 73.8796, sector: 'Camp' },
  { id: 'N_HADAPSAR', name: 'Hadapsar Gadital', lat: 18.5011, lng: 73.9261, sector: 'Hadapsar' },
  { id: 'N_BUND_GARDEN', name: 'Bund Garden / Sangam Bridge', lat: 18.5364, lng: 73.8812, sector: 'Mula-Mutha Confluence' },
  { id: 'N_YERAWADA', name: 'Yerawada Gunjan Chowk', lat: 18.5529, lng: 73.8797, sector: 'Yerawada' },
  { id: 'N_VIMAN_NAGAR', name: 'Viman Nagar (Nagar Rd)', lat: 18.5679, lng: 73.9143, sector: 'Viman Nagar' },
  { id: 'N_AIRPORT', name: 'Lohegaon Airport Junction', lat: 18.5822, lng: 73.9197, sector: 'Lohegaon' },
  { id: 'N_KHARADI', name: 'Kharadi Bypass', lat: 18.5515, lng: 73.9410, sector: 'Kharadi' },
  { id: 'N_UNIV_CIRCLE', name: 'Pune University Circle', lat: 18.5529, lng: 73.8270, sector: 'Ganeshkhind' },
  { id: 'N_AUNDH', name: 'Aundh Parihar Chowk', lat: 18.5620, lng: 73.8050, sector: 'Aundh' },
  { id: 'N_PASHAN', name: 'Pashan Sus Road Junction', lat: 18.5435, lng: 73.7924, sector: 'Pashan' },
  { id: 'N_BANER', name: 'Baner Balewadi Phata', lat: 18.5590, lng: 73.7868, sector: 'Baner' },
  { id: 'N_WAKAD', name: 'Wakad Bridge (NH48)', lat: 18.5980, lng: 73.7650, sector: 'Wakad' },
  { id: 'N_HINJAWADI', name: 'Hinjawadi IT Park Phase 1', lat: 18.5890, lng: 73.7180, sector: 'Hinjawadi' },
  { id: 'N_PIMPLE_SAUDAGAR', name: 'Pimple Saudagar (Kunal Icon)', lat: 18.5987, lng: 73.7975, sector: 'Pimple Saudagar' },
  { id: 'N_SANGVI', name: 'Old Sangvi (Pavana Bridge)', lat: 18.5818, lng: 73.8168, sector: 'Sangvi' },
  { id: 'N_DAPODI', name: 'Dapodi / Harris Bridge', lat: 18.5808, lng: 73.8318, sector: 'Dapodi' },
  { id: 'N_PIMPRI', name: 'Pimpri Chowk (PCMC)', lat: 18.6279, lng: 73.8131, sector: 'Pimpri' },
  { id: 'N_CHINCHWAD', name: 'Chinchwad Station', lat: 18.6420, lng: 73.7850, sector: 'Chinchwad' },
  { id: 'N_BHOSARI', name: 'Bhosari Nashik Phata', lat: 18.6242, lng: 73.8355, sector: 'Bhosari' },
  { id: 'N_NIGDI', name: 'Nigdi Bhakti Shakti Chowk', lat: 18.6518, lng: 73.7659, sector: 'Nigdi' }
];

const EDGES: EdgeDef[] = [
  // Central Pune (Real One-Ways: FC Rd southbound, JM Rd northbound)
  { id: 'R01', from: 'N_SHIVAJINAGAR', to: 'N_DECCAN', name: 'Fergusson College (FC) Road', roadType: 'primary', isOneWay: true, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Mutha Left Bank' },
  { id: 'R02', from: 'N_DECCAN', to: 'N_SHIVAJINAGAR', name: 'Jangali Maharaj (JM) Road', roadType: 'primary', isOneWay: true, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R03', from: 'N_DECCAN', to: 'N_NAL_STOP', name: 'Karve Road (Deccan - Nal Stop)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R04', from: 'N_NAL_STOP', to: 'N_KOTHRUD', name: 'Karve Road (Nal Stop - Kothrud)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R05', from: 'N_KOTHRUD', to: 'N_CHANDANI', name: 'Paud Road (Kothrud - Chandani Chowk)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 50, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R06', from: 'N_CHANDANI', to: 'N_WARJE', name: 'Mumbai-Bengaluru Bypass (Chandani - Warje)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 65, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R07', from: 'N_WARJE', to: 'N_SINHAGAD_RD', name: 'Warje - Anand Nagar Canal Link', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R08', from: 'N_DECCAN', to: 'N_SINHAGAD_RD', name: 'Sinhagad Road (Dandekar Bridge - Anand Nagar)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 30, isBridge: true, surface: 'asphalt', drainageCondition: 'poor', hasHistoricalFlood: true, waterwayProximity: 'Mutha River / Ambil Odha' },
  { id: 'R09', from: 'N_SINHAGAD_RD', to: 'N_DHAYARI', name: 'Sinhagad Road (Ekta Nagari - Dhayari)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'poor', hasHistoricalFlood: true, waterwayProximity: 'Mutha River' },
  { id: 'R10', from: 'N_DHAYARI', to: 'N_KATRAJ', name: 'Dhayari - Katraj Bypass (NH48)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 55, surface: 'concrete', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R11', from: 'N_WARJE', to: 'N_DHAYARI', name: 'NH48 Vadgaon Bridge - Dhayari', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 60, isBridge: true, surface: 'concrete', drainageCondition: 'moderate', hasHistoricalFlood: false, waterwayProximity: 'Mutha River Crossing' },
  { id: 'R12', from: 'N_DECCAN', to: 'N_SWARGATE', name: 'Tilak Road (Alka Talkies - Swargate)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 30, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Ambil Odha' },
  { id: 'R13', from: 'N_NAL_STOP', to: 'N_SINHAGAD_RD', name: 'Rajaram Bridge Link (Erandwane - Sinhagad Rd)', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 30, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Mutha River Bridge' },
  { id: 'R14', from: 'N_SWARGATE', to: 'N_BIBWEWADI', name: 'Satara Road (Swargate - Market Yard)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Ambil Odha' },
  { id: 'R15', from: 'N_BIBWEWADI', to: 'N_KATRAJ', name: 'Satara Road (Bibwewadi - Katraj)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R16', from: 'N_SHIVAJINAGAR', to: 'N_PUNE_STN', name: 'Raja Bahadur Mill / Sangamwadi Link', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Mutha River' },
  { id: 'R17', from: 'N_SWARGATE', to: 'N_CAMP', name: 'Jawaharlal Nehru / Seven Loves Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R18', from: 'N_CAMP', to: 'N_PUNE_STN', name: 'Dr Ambedkar / Sadhu Vaswani Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R19', from: 'N_CAMP', to: 'N_HADAPSAR', name: 'Solapur Highway (Pulgate - Hadapsar)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 50, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Bhairoba Nullah' },
  { id: 'R20', from: 'N_PUNE_STN', to: 'N_BUND_GARDEN', name: 'Bund Garden Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, isBridge: true, surface: 'asphalt', drainageCondition: 'clogged', hasHistoricalFlood: true, waterwayProximity: 'Mula-Mutha Confluence' },
  { id: 'R21', from: 'N_BUND_GARDEN', to: 'N_YERAWADA', name: 'Bund Garden Bridge - Yerawada', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Mula-Mutha River' },
  { id: 'R22', from: 'N_YERAWADA', to: 'N_VIMAN_NAGAR', name: 'Pune-Ahmednagar Highway (Yerawada - Viman Nagar)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 55, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R23', from: 'N_VIMAN_NAGAR', to: 'N_AIRPORT', name: 'Symbiosis - Lohegaon Airport Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R24', from: 'N_VIMAN_NAGAR', to: 'N_KHARADI', name: 'Nagar Road - Kharadi Bypass', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 55, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R25', from: 'N_KHARADI', to: 'N_HADAPSAR', name: 'Magarpatta / Mundhwa - Hadapsar Bridge', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Mula-Mutha River' },
  // West Pune & PCMC
  { id: 'R26', from: 'N_SHIVAJINAGAR', to: 'N_UNIV_CIRCLE', name: 'Ganeshkhind Road (Shivajinagar - Univ Circle)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R27', from: 'N_UNIV_CIRCLE', to: 'N_AUNDH', name: 'Aundh Road (Univ Circle - Parihar Chowk)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R28', from: 'N_UNIV_CIRCLE', to: 'N_PASHAN', name: 'Pashan Road (NCL - Pashan Circle)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R29', from: 'N_CHANDANI', to: 'N_PASHAN', name: 'NH48 Bavdhan - Pashan Link', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 65, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R30', from: 'N_PASHAN', to: 'N_BANER', name: 'Sus - Baner Link Road', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R31', from: 'N_AUNDH', to: 'N_BANER', name: 'Baner Road (Aundh - Balewadi Phata)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Ramnadi Stream' },
  { id: 'R32', from: 'N_BANER', to: 'N_WAKAD', name: 'NH48 Baner - Wakad Highway', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 65, isBridge: true, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false, waterwayProximity: 'Mula River Bridge' },
  { id: 'R33', from: 'N_WAKAD', to: 'N_HINJAWADI', name: 'Wakad Flyover - Hinjawadi Phase 1', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R34', from: 'N_WAKAD', to: 'N_PIMPLE_SAUDAGAR', name: 'Wakad - Pimple Saudagar Kokane Chowk', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R35', from: 'N_AUNDH', to: 'N_SANGVI', name: 'Aundh - Sangvi New Bridge', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, isBridge: true, surface: 'asphalt', drainageCondition: 'poor', hasHistoricalFlood: true, waterwayProximity: 'Pavana / Mula Confluence' },
  { id: 'R36', from: 'N_SANGVI', to: 'N_PIMPLE_SAUDAGAR', name: 'Sangvi - Pimple Saudagar Road', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Pavana River' },
  { id: 'R37', from: 'N_UNIV_CIRCLE', to: 'N_DAPODI', name: 'Bopodi - Harris Bridge (Old Mumbai-Pune Hwy)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 50, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Mula River Bridge' },
  { id: 'R38', from: 'N_SHIVAJINAGAR', to: 'N_YERAWADA', name: 'Holkar Bridge / Khadki - Yerawada Link', roadType: 'secondary', isOneWay: false, accessRestriction: 'no_heavy_vehicles', speedLimitKmph: 35, isBridge: true, surface: 'asphalt', drainageCondition: 'poor', hasHistoricalFlood: true, waterwayProximity: 'Mula River (Holkar Bridge)' },
  { id: 'R39', from: 'N_DAPODI', to: 'N_BHOSARI', name: 'Dapodi - Nashik Phata Grade Separator', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 55, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R40', from: 'N_DAPODI', to: 'N_PIMPRI', name: 'Old Mumbai-Pune Hwy (Dapodi - Pimpri)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 50, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R41', from: 'N_PIMPLE_SAUDAGAR', to: 'N_PIMPRI', name: 'Pimple Saudagar - Pimpri Bridge', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Pavana River' },
  { id: 'R42', from: 'N_BHOSARI', to: 'N_PIMPRI', name: 'Nashik Phata - Pimpri Spine Link', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R43', from: 'N_PIMPRI', to: 'N_CHINCHWAD', name: 'Old Mumbai-Pune Hwy (Pimpri - Chinchwad)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 50, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R44', from: 'N_CHINCHWAD', to: 'N_NIGDI', name: 'Chinchwad - Nigdi Pradhikaran Hwy', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 55, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R45', from: 'N_WAKAD', to: 'N_CHINCHWAD', name: 'Wakad - Dange Chowk - Chinchwad Link', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Pavana River' },
  { id: 'R46', from: 'N_DECCAN', to: 'N_PUNE_STN', name: 'Bhide / Lakdi Bridge - Riverside - Station', roadType: 'secondary', isOneWay: false, accessRestriction: 'no_heavy_vehicles', speedLimitKmph: 25, isBridge: true, surface: 'asphalt', drainageCondition: 'poor', hasHistoricalFlood: true, waterwayProximity: 'Mutha River Causeway' }
];

async function fetchElevations(points: { lat: number; lng: number }[]): Promise<number[]> {
  const lats = points.map(p => p.lat.toFixed(5)).join(',');
  const lngs = points.map(p => p.lng.toFixed(5)).join(',');
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Elevation API failed: ${res.status}`);
  const data = (await res.json()) as { elevation: number[] };
  return data.elevation;
}

async function fetchOsrmRoute(from: NodeDef, to: NodeDef) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  if (data.code !== 'Ok' || !data.routes?.length) return null;
  const r = data.routes[0];
  return {
    distanceKm: Math.round((r.distance / 1000) * 100) / 100,
    durationMins: Math.round((r.duration / 60) * 10) / 10,
    coordinatesLngLat: r.geometry.coordinates as [number, number][]
  };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Fetching Copernicus DEM elevations for ${NODES.length} Pune/PCMC nodes...`);
  const nodeElevs = await fetchElevations(NODES);
  const nodeMap: Record<string, NodeDef & { elevationM: number }> = {};
  NODES.forEach((n, idx) => {
    nodeMap[n.id] = { ...n, elevationM: Math.round(nodeElevs[idx] * 10) / 10 };
  });

  // Write terrain.csv from real Copernicus DEM elevations
  const terrainLines = ['location_id,sector_name,latitude,longitude,elevation_m,source,resolution'];
  Object.values(nodeMap).forEach(n => {
    terrainLines.push(`${n.id},"${n.name}",${n.lat},${n.lng},${n.elevationM},"Copernicus DEM GLO-90 via Open-Meteo Elevation API","90m"`);
  });
  fs.writeFileSync(path.resolve('datasets/processed/terrain.csv'), terrainLines.join('\n') + '\n');

  const features: any[] = [];
  for (const edge of EDGES) {
    const fromNode = nodeMap[edge.from];
    const toNode = nodeMap[edge.to];
    let osrm = null;
    try {
      osrm = await fetchOsrmRoute(fromNode, toNode);
    } catch {
      osrm = null;
    }
    await sleep(120);

    const coordsLngLat: [number, number][] = osrm
      ? osrm.coordinatesLngLat
      : [[fromNode.lng, fromNode.lat], [toNode.lng, toNode.lat]];

    // Simplify long polylines modestly (keep max ~24 vertices so GeoJSON is fast & accurate)
    let simplified = coordsLngLat;
    if (coordsLngLat.length > 24) {
      const step = Math.ceil(coordsLngLat.length / 22);
      simplified = coordsLngLat.filter((_, i) => i === 0 || i === coordsLngLat.length - 1 || i % step === 0);
    }

    const midIdx = Math.floor(simplified.length / 2);
    const midPt = simplified[midIdx];
    let midElev = (fromNode.elevationM + toNode.elevationM) / 2;
    try {
      const [e] = await fetchElevations([{ lat: midPt[1], lng: midPt[0] }]);
      midElev = Math.round(e * 10) / 10;
    } catch {
      // fallback to node mean
    }
    await sleep(60);

    const distKm = osrm ? osrm.distanceKm : 2.5;
    const minElev = Math.min(fromNode.elevationM, midElev, toNode.elevationM);
    const elevDiff = Math.abs(fromNode.elevationM - toNode.elevationM);
    const slopePct = distKm > 0 ? Math.round(((elevDiff / (distKm * 1000)) * 100) * 100) / 100 : 0.5;

    features.push({
      type: 'Feature',
      id: edge.id,
      geometry: {
        type: 'LineString',
        coordinates: simplified
      },
      properties: {
        road_id: edge.id,
        road_name: edge.name,
        from_node: edge.from,
        to_node: edge.to,
        road_type: edge.roadType,
        distance_km: distKm,
        estimated_speed_kmph: edge.speedLimitKmph,
        base_elevation_m: minElev,
        midpoint_elevation_m: midElev,
        slope_pct: slopePct,
        drainage_condition: edge.drainageCondition,
        access_restriction: edge.accessRestriction,
        one_way: edge.isOneWay,
        is_bridge: Boolean(edge.isBridge),
        is_tunnel: Boolean(edge.isTunnel),
        surface: edge.surface,
        has_historical_flood: edge.hasHistoricalFlood,
        waterway_proximity: edge.waterwayProximity || null,
        geometry_source: osrm ? 'OpenStreetMap via OSRM Driving Network' : 'Fallback Node Link'
      }
    });
    console.log(`Processed ${edge.id}: ${edge.name} (${distKm} km, minElev=${minElev}m, slope=${slopePct}%, pts=${simplified.length})`);
  }

  const geojson = {
    type: 'FeatureCollection',
    metadata: {
      region: 'Pune & Pimpri-Chinchwad, Maharashtra, India',
      road_source: 'OpenStreetMap Contributors (ODbL) via OSRM Project Routing Geometry',
      elevation_source: 'Copernicus DEM GLO-90 via Open-Meteo Elevation API',
      extracted_at: new Date().toISOString(),
      nodes_count: Object.keys(nodeMap).length,
      edges_count: features.length,
      nodes: nodeMap
    },
    features
  };

  fs.writeFileSync(path.resolve('datasets/processed/roads.geojson'), JSON.stringify(geojson, null, 2));
  console.log('Successfully generated datasets/processed/roads.geojson and datasets/processed/terrain.csv');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
