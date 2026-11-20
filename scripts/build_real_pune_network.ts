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

export const COMPREHENSIVE_PUNE_PCMC_NODES: NodeDef[] = [
  // --- CENTRAL PUNE ---
  { id: 'N_SHIVAJINAGAR', name: 'Shivajinagar (Sancheti Chowk)', lat: 18.5314, lng: 73.8446, sector: 'Central Pune' },
  { id: 'N_DECCAN', name: 'Deccan Gymkhana (Goodluck Chowk)', lat: 18.5186, lng: 73.8378, sector: 'Central Pune' },
  { id: 'N_FC_ROAD', name: 'FC Road (Fergusson College Main Gate)', lat: 18.5230, lng: 73.8415, sector: 'Central Pune' },
  { id: 'N_JM_ROAD', name: 'JM Road (Balgandharva Chowk)', lat: 18.5255, lng: 73.8488, sector: 'Central Pune' },
  { id: 'N_SWARGATE', name: 'Swargate (Jedhe Chowk)', lat: 18.5018, lng: 73.8580, sector: 'Central Pune' },
  { id: 'N_CAMP', name: 'Camp (MG Road / Pulgate)', lat: 18.5142, lng: 73.8796, sector: 'Camp-Cantonment' },
  { id: 'N_PUNE_STN', name: 'Pune Railway Station', lat: 18.5289, lng: 73.8744, sector: 'Station-Camp' },
  { id: 'N_SADASHIV_PETH', name: 'Sadashiv Peth (Perugate Chowk)', lat: 18.5105, lng: 73.8502, sector: 'Old Pune Peths' },
  { id: 'N_NARAYAN_PETH', name: 'Narayan Peth (Kesari Wada)', lat: 18.5170, lng: 73.8505, sector: 'Old Pune Peths' },
  { id: 'N_SHANIWAR_PETH', name: 'Shaniwar Peth (Shaniwar Wada)', lat: 18.5195, lng: 73.8553, sector: 'Old Pune Peths' },
  { id: 'N_KASBA_PETH', name: 'Kasba Peth (Kasba Ganpati)', lat: 18.5185, lng: 73.8585, sector: 'Old Pune Peths' },
  { id: 'N_KOREGAON_PARK', name: 'Koregaon Park (North Main Road)', lat: 18.5362, lng: 73.8940, sector: 'Koregaon Park' },
  { id: 'N_KALYANI_NAGAR', name: 'Kalyani Nagar (Bishop School Rd)', lat: 18.5482, lng: 73.9034, sector: 'Kalyani Nagar' },
  { id: 'N_BUND_GARDEN', name: 'Bund Garden / Sangam Bridge', lat: 18.5364, lng: 73.8812, sector: 'Mula-Mutha Confluence' },

  // --- WEST PUNE ---
  { id: 'N_KOTHRUD', name: 'Kothrud (Karve Statue)', lat: 18.5024, lng: 73.8095, sector: 'Kothrud' },
  { id: 'N_NAL_STOP', name: 'Nal Stop (Karve Road)', lat: 18.5078, lng: 73.8292, sector: 'Erandwane' },
  { id: 'N_KARVE_NAGAR', name: 'Karve Nagar (Cummins College Chowk)', lat: 18.4895, lng: 73.8185, sector: 'Karve Nagar' },
  { id: 'N_WARJE', name: 'Warje Flyover Junction', lat: 18.4864, lng: 73.8035, sector: 'Warje' },
  { id: 'N_BAVDHAN', name: 'Bavdhan Chowk', lat: 18.5140, lng: 73.7745, sector: 'Bavdhan' },
  { id: 'N_CHANDANI', name: 'Chandani Chowk (Paud Rd / NH48)', lat: 18.5082, lng: 73.7825, sector: 'Bavdhan-Kothrud' },
  { id: 'N_BANER', name: 'Baner Balewadi Phata', lat: 18.5590, lng: 73.7868, sector: 'Baner' },
  { id: 'N_BALEWADI', name: 'Balewadi High Street', lat: 18.5720, lng: 73.7725, sector: 'Balewadi' },
  { id: 'N_AUNDH', name: 'Aundh Parihar Chowk', lat: 18.5620, lng: 73.8050, sector: 'Aundh' },
  { id: 'N_PASHAN', name: 'Pashan Sus Road Junction', lat: 18.5435, lng: 73.7924, sector: 'Pashan' },
  { id: 'N_SUS', name: 'Sus Gaon / Pashan-Sus Link', lat: 18.5480, lng: 73.7550, sector: 'Sus' },
  { id: 'N_HINJAWADI', name: 'Hinjawadi IT Park Phase 1', lat: 18.5890, lng: 73.7180, sector: 'Hinjawadi' },
  { id: 'N_WAKAD', name: 'Wakad Bridge (NH48)', lat: 18.5980, lng: 73.7650, sector: 'Wakad' },
  { id: 'N_UNIV_CIRCLE', name: 'Pune University Circle', lat: 18.5529, lng: 73.8270, sector: 'Ganeshkhind' },

  // --- EAST PUNE ---
  { id: 'N_HADAPSAR', name: 'Hadapsar Gadital', lat: 18.5011, lng: 73.9261, sector: 'Hadapsar' },
  { id: 'N_MAGARPATTA', name: 'Magarpatta City (Tower Bridge)', lat: 18.5135, lng: 73.9242, sector: 'Hadapsar-Magarpatta' },
  { id: 'N_AMANORA', name: 'Amanora Town Centre', lat: 18.5180, lng: 73.9350, sector: 'Hadapsar-Amanora' },
  { id: 'N_KHARADI', name: 'Kharadi Bypass (EON Free Zone)', lat: 18.5515, lng: 73.9410, sector: 'Kharadi' },
  { id: 'N_VIMAN_NAGAR', name: 'Viman Nagar (Nagar Rd)', lat: 18.5679, lng: 73.9143, sector: 'Viman Nagar' },
  { id: 'N_YERAWADA', name: 'Yerawada Gunjan Chowk', lat: 18.5529, lng: 73.8797, sector: 'Yerawada' },
  { id: 'N_DHANORI', name: 'Dhanori Tingre Nagar Junction', lat: 18.5860, lng: 73.8870, sector: 'Dhanori' },
  { id: 'N_AIRPORT', name: 'Lohegaon Airport Junction', lat: 18.5822, lng: 73.9197, sector: 'Lohegaon' },
  { id: 'N_WAGHOLI', name: 'Wagholi (Pune-Nagar Highway)', lat: 18.5808, lng: 73.9787, sector: 'Wagholi' },
  { id: 'N_MUNDHWA', name: 'Mundhwa Bridge / Keshav Nagar Phata', lat: 18.5325, lng: 73.9250, sector: 'Mundhwa' },
  { id: 'N_KESHAV_NAGAR', name: 'Keshav Nagar (Mundhwa-Manjari Rd)', lat: 18.5280, lng: 73.9420, sector: 'Keshav Nagar' },

  // --- SOUTH PUNE ---
  { id: 'N_DHANKAWADI', name: 'Dhankawadi (Chavan Nagar)', lat: 18.4710, lng: 73.8560, sector: 'Dhankawadi' },
  { id: 'N_BIBWEWADI', name: 'Bibwewadi / Market Yard', lat: 18.4806, lng: 73.8648, sector: 'Bibwewadi' },
  { id: 'N_KATRAJ', name: 'Katraj Chowk (NH48)', lat: 18.4520, lng: 73.8520, sector: 'Katraj' },
  { id: 'N_KONDHWA', name: 'Kondhwa (Lullanagar / Khadi Machine)', lat: 18.4780, lng: 73.8890, sector: 'Kondhwa' },
  { id: 'N_UNDRI', name: 'Undri Chowk (Corinthians Club Link)', lat: 18.4610, lng: 73.9110, sector: 'Undri' },
  { id: 'N_WANOWRIE', name: 'Wanowrie (Command Hospital / Fatima Nagar)', lat: 18.5020, lng: 73.8960, sector: 'Wanowrie' },
  { id: 'N_NIBM', name: 'NIBM Road Junction', lat: 18.4840, lng: 73.9010, sector: 'NIBM' },
  { id: 'N_PISOLI', name: 'Pisoli Katraj-Mantarwadi Link', lat: 18.4480, lng: 73.9160, sector: 'Pisoli' },
  { id: 'N_AMBEGAON', name: 'Ambegaon Budruk (Katraj-Navale Bridge Link)', lat: 18.4550, lng: 73.8320, sector: 'Ambegaon' },
  { id: 'N_SINHAGAD_RD', name: 'Sinhagad Road (Anand Nagar / Ekta Nagari)', lat: 18.4968, lng: 73.8214, sector: 'Sinhagad Road' },
  { id: 'N_DHAYARI', name: 'Dhayari Phata (Sinhagad Rd)', lat: 18.4638, lng: 73.8166, sector: 'Dhayari' },

  // --- PCMC (PIMPRI-CHINCHWAD) ---
  { id: 'N_PIMPRI', name: 'Pimpri Chowk (PCMC Bhavan)', lat: 18.6279, lng: 73.8131, sector: 'Pimpri' },
  { id: 'N_CHINCHWAD', name: 'Chinchwad Station (Elpro Mall / Chaphekar Chowk)', lat: 18.6420, lng: 73.7850, sector: 'Chinchwad' },
  { id: 'N_AKURDI', name: 'Akurdi Railway Station / Khandoba Mal', lat: 18.6496, lng: 73.7707, sector: 'Akurdi' },
  { id: 'N_NIGDI', name: 'Nigdi Bhakti Shakti Chowk', lat: 18.6518, lng: 73.7659, sector: 'Nigdi' },
  { id: 'N_PRADHIKARAN', name: 'Nigdi Pradhikaran (Sector 24)', lat: 18.6560, lng: 73.7580, sector: 'Pradhikaran' },
  { id: 'N_BHOSARI', name: 'Bhosari Nashik Phata (Alandi Link)', lat: 18.6242, lng: 73.8355, sector: 'Bhosari' },
  { id: 'N_MOSHI', name: 'Moshi Toll Plaza (Pune-Nashik Highway)', lat: 18.6738, lng: 73.8502, sector: 'Moshi' },
  { id: 'N_CHIKHALI', name: 'Chikhali Kudalwadi Chowk', lat: 18.6810, lng: 73.8110, sector: 'Chikhali' },
  { id: 'N_TALAWADE', name: 'Talawade IT Park (Tower Chowk)', lat: 18.6942, lng: 73.7845, sector: 'Talawade' },
  { id: 'N_RAVET', name: 'Ravet Bridge (Expressway Mukai Chowk)', lat: 18.6432, lng: 73.7388, sector: 'Ravet' },
  { id: 'N_PUNAWALE', name: 'Punawale Underpass (NH48)', lat: 18.6180, lng: 73.7460, sector: 'Punawale' },
  { id: 'N_TATHAWADE', name: 'Tathawade Dange Chowk Road', lat: 18.6110, lng: 73.7550, sector: 'Tathawade' },
  { id: 'N_THERGAON', name: 'Thergaon Dange Chowk', lat: 18.6120, lng: 73.7810, sector: 'Thergaon' },
  { id: 'N_RAHATANI', name: 'Rahatani Phata (Finolex Chowk Link)', lat: 18.6050, lng: 73.7920, sector: 'Rahatani' },
  { id: 'N_PIMPLE_SAUDAGAR', name: 'Pimple Saudagar (Kunal Icon Chowk)', lat: 18.5987, lng: 73.7975, sector: 'Pimple Saudagar' },
  { id: 'N_PIMPLE_NILAKH', name: 'Pimple Nilakh (Rakshak Chowk Link)', lat: 18.5840, lng: 73.7880, sector: 'Pimple Nilakh' },
  { id: 'N_SANGVI', name: 'Old Sangvi (Pavana Bridge)', lat: 18.5818, lng: 73.8168, sector: 'Sangvi' },
  { id: 'N_DAPODI', name: 'Dapodi / Harris Bridge (Old Highway)', lat: 18.5808, lng: 73.8318, sector: 'Dapodi' },
  { id: 'N_KASARWADI', name: 'Kasarwadi Railway Station Junction', lat: 18.6050, lng: 73.8240, sector: 'Kasarwadi' }
];

export const COMPREHENSIVE_EDGES: EdgeDef[] = [
  // --- EXISTING BASELINE EDGES (R01 - R46) PRESERVED IDENTICALLY ---
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
  { id: 'R46', from: 'N_DECCAN', to: 'N_PUNE_STN', name: 'Bhide / Lakdi Bridge - Riverside - Station', roadType: 'secondary', isOneWay: false, accessRestriction: 'no_heavy_vehicles', speedLimitKmph: 25, isBridge: true, surface: 'asphalt', drainageCondition: 'poor', hasHistoricalFlood: true, waterwayProximity: 'Mutha River Causeway' },

  // --- NEW EXPANSION EDGES (R47 - R108) TO COVER EVERY REQUIRED SECTOR ---

  // Central Peths & Core
  { id: 'R47', from: 'N_DECCAN', to: 'N_SADASHIV_PETH', name: 'Kumthekar Road (Deccan - Sadashiv Peth)', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 30, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R48', from: 'N_SADASHIV_PETH', to: 'N_SWARGATE', name: 'Bajirao Road (Sadashiv Peth - Swargate)', roadType: 'primary', isOneWay: true, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R49', from: 'N_SWARGATE', to: 'N_NARAYAN_PETH', name: 'Shivaji Road (Swargate - Narayan Peth)', roadType: 'primary', isOneWay: true, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R50', from: 'N_NARAYAN_PETH', to: 'N_SHANIWAR_PETH', name: 'Laxmi Road - Shaniwar Wada Corridor', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 25, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R51', from: 'N_SHANIWAR_PETH', to: 'N_KASBA_PETH', name: 'Kasba Peth Ganpati Link Road', roadType: 'tertiary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 25, surface: 'paved', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R52', from: 'N_KASBA_PETH', to: 'N_PUNE_STN', name: 'Old Bazaar / Station Link', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 30, surface: 'asphalt', drainageCondition: 'poor', hasHistoricalFlood: true, waterwayProximity: 'Nagzari Nullah' },
  { id: 'R53', from: 'N_SHANIWAR_PETH', to: 'N_SHIVAJINAGAR', name: 'Dengle Bridge (Shaniwar Peth - Shivajinagar)', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 30, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Mutha River' },

  // Koregaon Park & Kalyani Nagar
  { id: 'R54', from: 'N_BUND_GARDEN', to: 'N_KOREGAON_PARK', name: 'North Main Road (Bund Garden - Koregaon Park)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R55', from: 'N_KOREGAON_PARK', to: 'N_KALYANI_NAGAR', name: 'Kalyani Nagar Bridge (Mula-Mutha Crossing)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Mula-Mutha River Bridge' },
  { id: 'R56', from: 'N_KALYANI_NAGAR', to: 'N_VIMAN_NAGAR', name: 'Central Avenue (Kalyani Nagar - Viman Nagar)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R57', from: 'N_PUNE_STN', to: 'N_KOREGAON_PARK', name: 'Tadiwala Road / South Main Link', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 30, surface: 'asphalt', drainageCondition: 'poor', hasHistoricalFlood: true, waterwayProximity: 'Bhairoba Nullah' },

  // West Pune (Karve Nagar, Bavdhan, Balewadi, Sus)
  { id: 'R58', from: 'N_KOTHRUD', to: 'N_KARVE_NAGAR', name: 'Dahanukar Colony - Karve Nagar Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R59', from: 'N_KARVE_NAGAR', to: 'N_WARJE', name: 'Karve Nagar - Warje Riverside Bridge', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Mutha River' },
  { id: 'R60', from: 'N_CHANDANI', to: 'N_BAVDHAN', name: 'Bavdhan Main Road (Chandani - Bavdhan)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R61', from: 'N_BAVDHAN', to: 'N_PASHAN', name: 'Bavdhan - Pashan Lake Bypass', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false, waterwayProximity: 'Ramnadi / Pashan Lake' },
  { id: 'R62', from: 'N_PASHAN', to: 'N_SUS', name: 'Pashan - Sus Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R63', from: 'N_SUS', to: 'N_HINJAWADI', name: 'Sus - Nande - Hinjawadi Phase 3 Link', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R64', from: 'N_BANER', to: 'N_BALEWADI', name: 'Baner - Balewadi High Street Link', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R65', from: 'N_BALEWADI', to: 'N_WAKAD', name: 'Balewadi Stadium - Wakad Bypass (NH48)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 65, isBridge: true, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false, waterwayProximity: 'Mula River' },

  // East Pune (Magarpatta, Amanora, Mundhwa, Keshav Nagar, Wagholi, Dhanori)
  { id: 'R66', from: 'N_HADAPSAR', to: 'N_MAGARPATTA', name: 'Magarpatta Main Road (Gadital - Magarpatta)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R67', from: 'N_MAGARPATTA', to: 'N_AMANORA', name: 'Magarpatta - Amanora Avenue Link', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R68', from: 'N_AMANORA', to: 'N_MUNDHWA', name: 'Amanora - Mundhwa Industrial Link', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R69', from: 'N_MUNDHWA', to: 'N_KESHAV_NAGAR', name: 'Mundhwa - Keshav Nagar River Bridge', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 30, isBridge: true, surface: 'asphalt', drainageCondition: 'poor', hasHistoricalFlood: true, waterwayProximity: 'Mula-Mutha River' },
  { id: 'R70', from: 'N_MUNDHWA', to: 'N_KHARADI', name: 'Mundhwa - Kharadi South Bridge', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Mula-Mutha River' },
  { id: 'R71', from: 'N_KHARADI', to: 'N_WAGHOLI', name: 'Pune-Nagar Highway (Kharadi - Wagholi)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 55, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R72', from: 'N_YERAWADA', to: 'N_DHANORI', name: 'Jail Road - Dhanori Tingre Nagar Link', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R73', from: 'N_DHANORI', to: 'N_AIRPORT', name: 'Dhanori - Lohegaon Airport Approach', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R74', from: 'N_AIRPORT', to: 'N_WAGHOLI', name: 'Lohegaon - Wagholi Connector', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },

  // South Pune (Dhankawadi, Kondhwa, Undri, Wanowrie, NIBM, Pisoli, Ambegaon)
  { id: 'R75', from: 'N_BIBWEWADI', to: 'N_DHANKAWADI', name: 'Bibwewadi - Dhankawadi Link Road', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R76', from: 'N_DHANKAWADI', to: 'N_KATRAJ', name: 'Dhankawadi - Katraj Ghat Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R77', from: 'N_KATRAJ', to: 'N_AMBEGAON', name: 'NH48 Navale Bridge - Ambegaon - Katraj', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 60, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R78', from: 'N_AMBEGAON', to: 'N_DHAYARI', name: 'Ambegaon - Dhayari Link Road', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R79', from: 'N_SWARGATE', to: 'N_WANOWRIE', name: 'Golibar Maidan - Wanowrie Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R80', from: 'N_WANOWRIE', to: 'N_HADAPSAR', name: 'Fatima Nagar - Hadapsar Link', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R81', from: 'N_WANOWRIE', to: 'N_KONDHWA', name: 'Lullanagar - Kondhwa Main Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R82', from: 'N_KONDHWA', to: 'N_NIBM', name: 'Kondhwa - NIBM Road Corridor', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R83', from: 'N_NIBM', to: 'N_UNDRI', name: 'NIBM - Undri Link Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R84', from: 'N_UNDRI', to: 'N_PISOLI', name: 'Undri - Pisoli Road', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 35, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R85', from: 'N_KATRAJ', to: 'N_KONDHWA', name: 'Katraj - Kondhwa Bypass Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Ghat Catchment' },
  { id: 'R86', from: 'N_PISOLI', to: 'N_HADAPSAR', name: 'Mantarwadi - Hadapsar Ring Link', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 50, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },

  // PCMC Grid (Akurdi, Pradhikaran, Moshi, Chikhali, Talawade, Ravet, Punawale, Tathawade, Thergaon, Rahatani, Pimple Nilakh, Kasarwadi)
  { id: 'R87', from: 'N_CHINCHWAD', to: 'N_AKURDI', name: 'Old Highway (Chinchwad - Akurdi)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 50, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R88', from: 'N_AKURDI', to: 'N_NIGDI', name: 'Tilak Chowk - Nigdi Flyover', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 50, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R89', from: 'N_NIGDI', to: 'N_PRADHIKARAN', name: 'Nigdi - Sector 24 Pradhikaran Spine', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R90', from: 'N_PRADHIKARAN', to: 'N_RAVET', name: 'Pradhikaran - Ravet Mukai Chowk Link', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R91', from: 'N_RAVET', to: 'N_PUNAWALE', name: 'Ravet - Punawale Expressway Service Road', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R92', from: 'N_PUNAWALE', to: 'N_TATHAWADE', name: 'Punawale - Tathawade Underpass Link', roadType: 'secondary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R93', from: 'N_TATHAWADE', to: 'N_WAKAD', name: 'Tathawade - Wakad Dange Chowk Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R94', from: 'N_TATHAWADE', to: 'N_THERGAON', name: 'Tathawade - Thergaon Dange Chowk Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R95', from: 'N_THERGAON', to: 'N_RAHATANI', name: 'Thergaon - Rahatani Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: false },
  { id: 'R96', from: 'N_RAHATANI', to: 'N_PIMPLE_SAUDAGAR', name: 'Rahatani - Pimple Saudagar Link', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R97', from: 'N_PIMPLE_SAUDAGAR', to: 'N_PIMPLE_NILAKH', name: 'Pimple Saudagar - Pimple Nilakh Linear Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R98', from: 'N_PIMPLE_NILAKH', to: 'N_AUNDH', name: 'Rakshak Chowk Bridge (Pimple Nilakh - Aundh)', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Mula River' },
  { id: 'R99', from: 'N_PIMPLE_NILAKH', to: 'N_BANER', name: 'Pimple Nilakh - Baner Mula Causeway', roadType: 'secondary', isOneWay: false, accessRestriction: 'no_heavy_vehicles', speedLimitKmph: 30, isBridge: true, surface: 'asphalt', drainageCondition: 'poor', hasHistoricalFlood: true, waterwayProximity: 'Mula River Causeway' },
  { id: 'R100', from: 'N_PIMPRI', to: 'N_KASARWADI', name: 'Old Highway (Pimpri - Kasarwadi)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 50, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R101', from: 'N_KASARWADI', to: 'N_DAPODI', name: 'Old Highway (Kasarwadi - Dapodi)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 50, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R102', from: 'N_BHOSARI', to: 'N_MOSHI', name: 'Pune-Nashik Highway (Bhosari - Moshi)', roadType: 'trunk', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 60, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R103', from: 'N_MOSHI', to: 'N_CHIKHALI', name: 'Moshi - Chikhali Spine Road', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R104', from: 'N_CHIKHALI', to: 'N_TALAWADE', name: 'Chikhali - Talawade IT Corridor', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'concrete', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R105', from: 'N_TALAWADE', to: 'N_NIGDI', name: 'Talawade - Nigdi Dehu Road Bypass', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 50, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R106', from: 'N_CHIKHALI', to: 'N_BHOSARI', name: 'Chikhali - Bhosari MIDC Spine', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 45, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R107', from: 'N_RAVET', to: 'N_CHINCHWAD', name: 'Ravet - Walhekarwadi - Chinchwad Link', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, surface: 'asphalt', drainageCondition: 'good', hasHistoricalFlood: false },
  { id: 'R108', from: 'N_THERGAON', to: 'N_CHINCHWAD', name: 'Thergaon - Aditya Birla Hospital - Chinchwad', roadType: 'primary', isOneWay: false, accessRestriction: 'all_vehicles', speedLimitKmph: 40, isBridge: true, surface: 'asphalt', drainageCondition: 'moderate', hasHistoricalFlood: true, waterwayProximity: 'Pavana River' }
];

async function fetchElevations(points: { lat: number; lng: number }[]): Promise<number[]> {
  const lats = points.map(p => p.lat.toFixed(5)).join(',');
  const lngs = points.map(p => p.lng.toFixed(5)).join(',');
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'SanketSetu-CityWide-DEM/1.0' } });
  if (!res.ok) throw new Error(`Elevation API failed: ${res.status}`);
  const data = (await res.json()) as { elevation: number[] };
  return data.elevation;
}

async function fetchOsrmRoute(from: NodeDef, to: NodeDef) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { 'User-Agent': 'SanketSetu-CityWide-OSRM/1.0' } });
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

export async function buildCityWidePuneNetwork() {
  console.log(`Starting real-world road graph compilation for ${COMPREHENSIVE_PUNE_PCMC_NODES.length} nodes and ${COMPREHENSIVE_EDGES.length} edges...`);

  // 1. Fetch real elevations for all nodes in batches of 40
  const nodeMap: Record<string, NodeDef & { elevationM: number }> = {};
  const batchSize = 40;
  for (let i = 0; i < COMPREHENSIVE_PUNE_PCMC_NODES.length; i += batchSize) {
    const chunk = COMPREHENSIVE_PUNE_PCMC_NODES.slice(i, i + batchSize);
    try {
      const elevs = await fetchElevations(chunk);
      chunk.forEach((n, idx) => {
        nodeMap[n.id] = { ...n, elevationM: Math.round(elevs[idx] * 10) / 10 };
      });
      console.log(`Elevations retrieved for chunk ${i} - ${i + chunk.length}`);
    } catch (err: any) {
      console.warn(`Elevation fetch failed for chunk: ${err.message}. Using default topography 560m.`);
      chunk.forEach(n => {
        nodeMap[n.id] = { ...n, elevationM: 560 };
      });
    }
    await sleep(250);
  }

  // Load existing roads.json to reuse already downloaded R01-R46 geometries whenever valid
  let existingRoadMap: Record<string, any> = {};
  try {
    const existingFile = fs.readFileSync(path.resolve('src/data/roads.json'), 'utf8');
    const existingParsed = JSON.parse(existingFile);
    existingParsed.features.forEach((f: any) => {
      existingRoadMap[f.properties.road_id] = f;
    });
    console.log(`Loaded ${Object.keys(existingRoadMap).length} cached baseline OSM corridors.`);
  } catch {
    existingRoadMap = {};
  }

  const features: any[] = [];
  let osrmCallsCount = 0;

  for (const edge of COMPREHENSIVE_EDGES) {
    const fromNode = nodeMap[edge.from];
    const toNode = nodeMap[edge.to];
    if (!fromNode || !toNode) {
      console.error(`Missing node definition for edge ${edge.id}: from=${edge.from}, to=${edge.to}`);
      continue;
    }

    // Reuse existing geometry if available
    let coordsLngLat: [number, number][] | null = null;
    let distKm = 2.5;

    if (existingRoadMap[edge.id]) {
      const existing = existingRoadMap[edge.id];
      coordsLngLat = existing.geometry.coordinates;
      distKm = existing.properties.distance_km;
    } else {
      // Fetch fresh real OSM driving geometry via OSRM
      try {
        const osrm = await fetchOsrmRoute(fromNode, toNode);
        osrmCallsCount++;
        if (osrm && osrm.coordinatesLngLat.length > 0) {
          coordsLngLat = osrm.coordinatesLngLat;
          distKm = osrm.distanceKm;
        }
      } catch (e: any) {
        console.warn(`OSRM failed for ${edge.id} (${fromNode.name} -> ${toNode.name}): ${e.message}`);
      }
      await sleep(150); // Respect rate limit
    }

    if (!coordsLngLat || coordsLngLat.length === 0) {
      coordsLngLat = [[fromNode.lng, fromNode.lat], [toNode.lng, toNode.lat]];
    }

    // Polyline simplification for fast rendering while preserving high-fidelity geometry
    let simplified = coordsLngLat;
    if (coordsLngLat.length > 26) {
      const step = Math.ceil(coordsLngLat.length / 24);
      simplified = coordsLngLat.filter((_, i) => i === 0 || i === coordsLngLat.length - 1 || i % step === 0);
    }

    const minElev = Math.min(fromNode.elevationM, toNode.elevationM);
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
        midpoint_elevation_m: Math.round(((fromNode.elevationM + toNode.elevationM) / 2) * 10) / 10,
        slope_pct: slopePct,
        drainage_condition: edge.drainageCondition,
        access_restriction: edge.accessRestriction,
        one_way: edge.isOneWay,
        is_bridge: Boolean(edge.isBridge),
        is_tunnel: Boolean(edge.isTunnel),
        surface: edge.surface,
        has_historical_flood: edge.hasHistoricalFlood,
        waterway_proximity: edge.waterwayProximity || null,
        geometry_source: 'OpenStreetMap via OSRM Driving Network'
      }
    });

    console.log(`[Compiled] ${edge.id}: ${edge.name} (${distKm} km, slope: ${slopePct}%)`);
  }

  const geojson = {
    type: 'FeatureCollection',
    metadata: {
      region: 'Pune Metropolitan Region & Pimpri-Chinchwad, Maharashtra, India',
      road_source: 'OpenStreetMap Contributors (ODbL) via OSRM Project Routing Geometry',
      elevation_source: 'Copernicus DEM GLO-90 via Open-Meteo Elevation API',
      extracted_at: new Date().toISOString(),
      nodes_count: Object.keys(nodeMap).length,
      edges_count: features.length,
      nodes: nodeMap
    },
    features
  };

  const outputRoadsJsonPath = path.resolve('src/data/roads.json');
  fs.writeFileSync(outputRoadsJsonPath, JSON.stringify(geojson, null, 2));

  const outputGeoJsonPath = path.resolve('datasets/processed/roads.geojson');
  fs.writeFileSync(outputGeoJsonPath, JSON.stringify(geojson, null, 2));

  console.log(`\nSUCCESS: Generated ${outputRoadsJsonPath} and ${outputGeoJsonPath}`);
  console.log(`Total Nodes: ${Object.keys(nodeMap).length}, Total Edges: ${features.length}, OSRM Calls: ${osrmCallsCount}`);
}

// Execute if run directly
if (process.argv[1]?.includes('build_real_pune_network')) {
  buildCityWidePuneNetwork().catch(err => {
    console.error('Build network failed:', err);
    process.exit(1);
  });
}
