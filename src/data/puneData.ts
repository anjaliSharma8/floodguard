import { RoadNode, RoadSegment, Shelter, Hospital, EmergencyFacility, CommunityReport, LivePoll, RainfallObservation, HistoricalFlood } from '../types';

export const PUNE_ROAD_NODES: Record<string, RoadNode> = {
  N_SHIVAJINAGAR: {
    id: 'N_SHIVAJINAGAR',
    name: 'Shivajinagar Junction (Sancheti Chowk)',
    lat: 18.5314,
    lng: 73.8446,
    elevationM: 560
  },
  N_DECCAN: {
    id: 'N_DECCAN',
    name: 'Deccan Gymkhana (Goodluck Chowk)',
    lat: 18.5186,
    lng: 73.8378,
    elevationM: 558
  },
  N_SINHAGAD_RD: {
    id: 'N_SINHAGAD_RD',
    name: 'Sinhagad Road (Anand Nagar / Ekta Nagari)',
    lat: 18.4980,
    lng: 73.8210,
    elevationM: 546
  },
  N_KOTHRUD: {
    id: 'N_KOTHRUD',
    name: 'Kothrud (Chandani Chowk Road)',
    lat: 18.5020,
    lng: 73.8060,
    elevationM: 572
  },
  N_SWARGATE: {
    id: 'N_SWARGATE',
    name: 'Swargate (Jedhe Chowk Hub)',
    lat: 18.5018,
    lng: 73.8580,
    elevationM: 559
  },
  N_KATRAJ: {
    id: 'N_KATRAJ',
    name: 'Katraj Junction',
    lat: 18.4520,
    lng: 73.8520,
    elevationM: 585
  },
  N_BUND_GARDEN: {
    id: 'N_BUND_GARDEN',
    name: 'Bund Garden / Sangam Bridge',
    lat: 18.5340,
    lng: 73.8790,
    elevationM: 551
  },
  N_AIRPORT: {
    id: 'N_AIRPORT',
    name: 'Lohegaon Airport Junction',
    lat: 18.5822,
    lng: 73.9197,
    elevationM: 568
  },
  N_AUNDH: {
    id: 'N_AUNDH',
    name: 'Aundh Parihar Chowk',
    lat: 18.5620,
    lng: 73.8050,
    elevationM: 565
  },
  N_WAKAD: {
    id: 'N_WAKAD',
    name: 'Wakad Bridge & Highway',
    lat: 18.5980,
    lng: 73.7650,
    elevationM: 574
  },
  N_HINJAWADI: {
    id: 'N_HINJAWADI',
    name: 'Hinjawadi IT Park Phase 1',
    lat: 18.5890,
    lng: 73.7180,
    elevationM: 578
  },
  N_PIMPRI: {
    id: 'N_PIMPRI',
    name: 'Pimpri Chhatrapati Shivaji Chowk',
    lat: 18.6279,
    lng: 73.8131,
    elevationM: 562
  },
  N_CHINCHWAD: {
    id: 'N_CHINCHWAD',
    name: 'Chinchwad Station Junction',
    lat: 18.6420,
    lng: 73.7850,
    elevationM: 566
  }
};

export const INITIAL_ROAD_SEGMENTS: RoadSegment[] = [
  {
    id: 'R01',
    name: 'Fergusson College (FC) Road',
    from: 'N_SHIVAJINAGAR',
    to: 'N_DECCAN',
    distanceKm: 1.8,
    speedKmph: 35,
    roadType: 'primary',
    baseElevationM: 560,
    slopePct: 1.2,
    drainageCondition: 'moderate',
    riskScore: 42,
    status: 'caution',
    coordinates: [
      [18.5314, 73.8446],
      [18.5245, 73.8402],
      [18.5186, 73.8378]
    ]
  },
  {
    id: 'R02',
    name: 'Jangali Maharaj (JM) Road',
    from: 'N_SHIVAJINAGAR',
    to: 'N_DECCAN',
    distanceKm: 1.9,
    speedKmph: 40,
    roadType: 'primary',
    baseElevationM: 558,
    slopePct: 0.8,
    drainageCondition: 'good',
    riskScore: 28,
    status: 'open',
    coordinates: [
      [18.5314, 73.8446],
      [18.5255, 73.8475],
      [18.5186, 73.8378]
    ]
  },
  {
    id: 'R03',
    name: 'Sinhagad Road (Anand Nagar Stretch)',
    from: 'N_DECCAN',
    to: 'N_SINHAGAD_RD',
    distanceKm: 3.8,
    speedKmph: 25,
    roadType: 'primary',
    baseElevationM: 546,
    slopePct: 0.4,
    drainageCondition: 'poor',
    riskScore: 88,
    status: 'critical_waterlogged',
    coordinates: [
      [18.5186, 73.8378],
      [18.5080, 73.8320],
      [18.4980, 73.8210]
    ]
  },
  {
    id: 'R04',
    name: 'Karve Road (Deccan to Kothrud)',
    from: 'N_DECCAN',
    to: 'N_KOTHRUD',
    distanceKm: 3.2,
    speedKmph: 35,
    roadType: 'primary',
    baseElevationM: 572,
    slopePct: 2.1,
    drainageCondition: 'good',
    riskScore: 18,
    status: 'open',
    coordinates: [
      [18.5186, 73.8378],
      [18.5075, 73.8240],
      [18.5020, 73.8060]
    ]
  },
  {
    id: 'R05',
    name: 'Warje Bypass / Canal Link',
    from: 'N_KOTHRUD',
    to: 'N_SINHAGAD_RD',
    distanceKm: 4.1,
    speedKmph: 30,
    roadType: 'secondary',
    baseElevationM: 565,
    slopePct: 1.5,
    drainageCondition: 'moderate',
    riskScore: 38,
    status: 'open',
    coordinates: [
      [18.5020, 73.8060],
      [18.4850, 73.8120],
      [18.4980, 73.8210]
    ]
  },
  {
    id: 'R06',
    name: 'Tilak Road (Deccan to Swargate)',
    from: 'N_DECCAN',
    to: 'N_SWARGATE',
    distanceKm: 2.4,
    speedKmph: 30,
    roadType: 'primary',
    baseElevationM: 559,
    slopePct: 0.7,
    drainageCondition: 'moderate',
    riskScore: 45,
    status: 'caution',
    coordinates: [
      [18.5186, 73.8378],
      [18.5100, 73.8480],
      [18.5018, 73.8580]
    ]
  },
  {
    id: 'R07',
    name: 'Satara Road (Swargate to Katraj)',
    from: 'N_SWARGATE',
    to: 'N_KATRAJ',
    distanceKm: 5.6,
    speedKmph: 45,
    roadType: 'primary',
    baseElevationM: 585,
    slopePct: 3.0,
    drainageCondition: 'moderate',
    riskScore: 25,
    status: 'open',
    coordinates: [
      [18.5018, 73.8580],
      [18.4720, 73.8550],
      [18.4520, 73.8520]
    ]
  },
  {
    id: 'R08',
    name: 'Pune Station to Bund Garden Road',
    from: 'N_SHIVAJINAGAR',
    to: 'N_BUND_GARDEN',
    distanceKm: 3.6,
    speedKmph: 35,
    roadType: 'primary',
    baseElevationM: 551,
    slopePct: 0.5,
    drainageCondition: 'moderate',
    riskScore: 68,
    status: 'caution',
    coordinates: [
      [18.5314, 73.8446],
      [18.5280, 73.8680],
      [18.5340, 73.8790]
    ]
  },
  {
    id: 'R09',
    name: 'Yerawada - Airport Road',
    from: 'N_BUND_GARDEN',
    to: 'N_AIRPORT',
    distanceKm: 6.8,
    speedKmph: 50,
    roadType: 'trunk',
    baseElevationM: 568,
    slopePct: 1.4,
    drainageCondition: 'good',
    riskScore: 22,
    status: 'open',
    coordinates: [
      [18.5340, 73.8790],
      [18.5520, 73.8920],
      [18.5822, 73.9197]
    ]
  },
  {
    id: 'R10',
    name: 'Ganeshkhind Road (Univ to Aundh)',
    from: 'N_SHIVAJINAGAR',
    to: 'N_AUNDH',
    distanceKm: 4.5,
    speedKmph: 40,
    roadType: 'primary',
    baseElevationM: 565,
    slopePct: 1.1,
    drainageCondition: 'good',
    riskScore: 20,
    status: 'open',
    coordinates: [
      [18.5314, 73.8446],
      [18.5580, 73.8180],
      [18.5620, 73.8050]
    ]
  },
  {
    id: 'R11',
    name: 'Aundh-Baner-Wakad Highway',
    from: 'N_AUNDH',
    to: 'N_WAKAD',
    distanceKm: 5.8,
    speedKmph: 55,
    roadType: 'trunk',
    baseElevationM: 574,
    slopePct: 1.3,
    drainageCondition: 'good',
    riskScore: 14,
    status: 'open',
    coordinates: [
      [18.5620, 73.8050],
      [18.5680, 73.7850],
      [18.5980, 73.7650]
    ]
  },
  {
    id: 'R12',
    name: 'Wakad to Hinjawadi IT Park Phase 1',
    from: 'N_WAKAD',
    to: 'N_HINJAWADI',
    distanceKm: 4.2,
    speedKmph: 45,
    roadType: 'primary',
    baseElevationM: 578,
    slopePct: 0.9,
    drainageCondition: 'good',
    riskScore: 19,
    status: 'open',
    coordinates: [
      [18.5980, 73.7650],
      [18.5910, 73.7380],
      [18.5890, 73.7180]
    ]
  },
  {
    id: 'R13',
    name: 'Wakad - Pimple Saudagar - Pimpri Link',
    from: 'N_WAKAD',
    to: 'N_PIMPRI',
    distanceKm: 5.4,
    speedKmph: 40,
    roadType: 'primary',
    baseElevationM: 562,
    slopePct: 0.7,
    drainageCondition: 'moderate',
    riskScore: 48,
    status: 'caution',
    coordinates: [
      [18.5980, 73.7650],
      [18.6180, 73.7880],
      [18.6279, 73.8131]
    ]
  },
  {
    id: 'R14',
    name: 'Pimpri - Chinchwad Grade Separator',
    from: 'N_PIMPRI',
    to: 'N_CHINCHWAD',
    distanceKm: 3.1,
    speedKmph: 50,
    roadType: 'trunk',
    baseElevationM: 566,
    slopePct: 0.5,
    drainageCondition: 'good',
    riskScore: 26,
    status: 'open',
    coordinates: [
      [18.6279, 73.8131],
      [18.6298, 73.7997],
      [18.6420, 73.7850]
    ]
  },
  {
    id: 'R15',
    name: 'Old Pune-Mumbai Highway (Shivajinagar-Pimpri)',
    from: 'N_SHIVAJINAGAR',
    to: 'N_PIMPRI',
    distanceKm: 11.2,
    speedKmph: 55,
    roadType: 'trunk',
    baseElevationM: 560,
    slopePct: 0.8,
    drainageCondition: 'good',
    riskScore: 24,
    status: 'open',
    coordinates: [
      [18.5314, 73.8446],
      [18.5720, 73.8320],
      [18.6279, 73.8131]
    ]
  },
  {
    id: 'R16',
    name: 'Sinhagad Road - Dhayari - Katraj Bypass',
    from: 'N_SINHAGAD_RD',
    to: 'N_KATRAJ',
    distanceKm: 6.5,
    speedKmph: 40,
    roadType: 'secondary',
    baseElevationM: 580,
    slopePct: 2.4,
    drainageCondition: 'moderate',
    riskScore: 36,
    status: 'open',
    coordinates: [
      [18.4980, 73.8210],
      [18.4750, 73.8400],
      [18.4520, 73.8520]
    ]
  }
];

export const INITIAL_SHELTERS: Shelter[] = [
  {
    id: 'SH_01',
    name: 'Shivajinagar Relief Community Hall',
    lat: 18.5320,
    lng: 73.8460,
    capacity: 250,
    currentOccupancy: 65,
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
    currentOccupancy: 120,
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
    currentOccupancy: 210,
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
    currentOccupancy: 95,
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
    currentOccupancy: 110,
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
    currentOccupancy: 45,
    petFriendly: false,
    wheelchairAccessible: true,
    contact: '+91-20-26681020',
    address: 'Airport Road Junction, Yerawada',
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
  }
];

export const INITIAL_EMERGENCY_FACILITIES: EmergencyFacility[] = [
  {
    id: 'EM_01',
    name: 'PMC Disaster Management Control Room',
    type: 'Disaster Control',
    lat: 18.5308,
    lng: 73.8553,
    contact: '+91-20-25501269',
    specialization: 'Central Command, Dam Release Alerts & River Basin Sirens',
    serviceHours: '24x7'
  },
  {
    id: 'EM_02',
    name: 'Central Fire Brigade HQ (Bhavani Peth)',
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
    type: 'NDRF Post',
    lat: 18.7200,
    lng: 73.6800,
    contact: '1070 / +91-20-24328888',
    specialization: 'Deep Flood Rescue, Amphibious Vehicles & Swift Water Crews',
    serviceHours: '24x7'
  },
  {
    id: 'EM_04',
    name: 'RESQ Charitable Trust Animal Rescue Center',
    type: 'Animal Rescue',
    lat: 18.5280,
    lng: 73.7480,
    contact: '+91-9890999111',
    specialization: 'Wildlife & Domestic Animals, Large-Animal Flooding Ambulances',
    serviceHours: '24x7'
  },
  {
    id: 'EM_05',
    name: 'SPCA Pune & Veterinary Clinic',
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
    type: 'Animal Rescue',
    lat: 18.5040,
    lng: 73.7990,
    contact: '+91-9158000456',
    specialization: 'Street Dogs, Cats & Birds Emergency Shelter',
    serviceHours: '24x7'
  }
];

export const INITIAL_COMMUNITY_REPORTS: CommunityReport[] = [
  {
    id: 'REP_101',
    userId: 'usr_pune_89',
    roadId: 'R03',
    locationName: 'Sinhagad Road near Ekta Nagari',
    lat: 18.4980,
    lng: 73.8210,
    reportType: 'Road flooded',
    description: 'Water level reached knee height (~1.5 ft) on riverside lane. Small cars cannot pass. Mutha river backwater rising.',
    severity: 'Critical',
    timestamp: '2026-10-30T08:15:00Z',
    verificationStatus: 'Verified',
    confidenceScore: 0.94
  },
  {
    id: 'REP_102',
    userId: 'usr_pune_42',
    roadId: 'R01',
    locationName: 'FC Road outside Starbucks',
    lat: 18.5245,
    lng: 73.8402,
    reportType: 'Waterlogging',
    description: 'Moderate water accumulation near footpath drain, 2-wheelers can pass with caution.',
    severity: 'Moderate',
    timestamp: '2026-10-30T08:30:00Z',
    verificationStatus: 'Verified',
    confidenceScore: 0.85
  },
  {
    id: 'REP_103',
    userId: 'usr_pune_17',
    roadId: 'R08',
    locationName: 'Bund Garden Bridge approach',
    lat: 18.5340,
    lng: 73.8790,
    reportType: 'Traffic disruption',
    description: 'Traffic crawl due to 6-inch water puddles near bridge ramp.',
    severity: 'High',
    timestamp: '2026-10-30T08:45:00Z',
    verificationStatus: 'Under Review',
    confidenceScore: 0.74
  },
  {
    id: 'REP_104',
    userId: 'usr_pune_63',
    roadId: 'R13',
    locationName: 'Pimple Saudagar Linear Garden',
    lat: 18.6180,
    lng: 73.7880,
    reportType: 'Drainage overflow',
    description: 'Manhole cover dislodged due to storm water pressure.',
    severity: 'High',
    timestamp: '2026-10-30T09:00:00Z',
    verificationStatus: 'Reported',
    confidenceScore: 0.68
  },
  {
    id: 'REP_105',
    userId: 'usr_pune_55',
    roadId: 'R04',
    locationName: 'Karve Road near Nal Stop',
    lat: 18.5075,
    lng: 73.8240,
    reportType: 'Fallen tree',
    description: 'Branch fell on side lane, PMC garden dept notified, single lane slow.',
    severity: 'Moderate',
    timestamp: '2026-10-30T09:10:00Z',
    verificationStatus: 'Verified',
    confidenceScore: 0.90
  }
];

export const INITIAL_POLLS: LivePoll[] = [
  {
    id: 'POLL_01',
    roadId: 'R03',
    roadName: 'Sinhagad Road (Anand Nagar stretch)',
    question: 'What is the condition of Sinhagad Road right now?',
    options: ['Completely safe', 'Minor waterlogging', 'Heavy waterlogging', 'Road blocked', 'Need emergency assistance'],
    votes: {
      'Completely safe': 14,
      'Minor waterlogging': 28,
      'Heavy waterlogging': 112,
      'Road blocked': 184,
      'Need emergency assistance': 19
    },
    totalVotes: 357,
    isActive: true
  },
  {
    id: 'POLL_02',
    roadId: 'R01',
    roadName: 'FC Road',
    question: 'How is the condition of FC Road right now?',
    options: ['Completely safe', 'Minor waterlogging', 'Heavy waterlogging', 'Road blocked', 'Need emergency assistance'],
    votes: {
      'Completely safe': 180,
      'Minor waterlogging': 64,
      'Heavy waterlogging': 12,
      'Road blocked': 2,
      'Need emergency assistance': 0
    },
    totalVotes: 258,
    isActive: true
  },
  {
    id: 'POLL_03',
    roadId: 'R08',
    roadName: 'Bund Garden Approach',
    question: 'What is the water condition at Bund Garden approach road?',
    options: ['Completely safe', 'Minor waterlogging', 'Heavy waterlogging', 'Road blocked', 'Need emergency assistance'],
    votes: {
      'Completely safe': 35,
      'Minor waterlogging': 89,
      'Heavy waterlogging': 74,
      'Road blocked': 18,
      'Need emergency assistance': 3
    },
    totalVotes: 219,
    isActive: true
  }
];

export const INITIAL_RAINFALL: RainfallObservation[] = [
  { stationId: 'PUN_01', stationName: 'IMD Shivajinagar', lat: 18.5314, lng: 73.8446, rainfallMm: 42.5, durationHrs: 4.0, source: 'IMD Automated Weather Station', timestamp: '2026-10-30T08:00:00Z' },
  { stationId: 'PUN_02', stationName: 'IMD Pashan', lat: 18.5388, lng: 73.7915, rainfallMm: 35.0, durationHrs: 3.5, source: 'IMD AWS', timestamp: '2026-10-30T08:00:00Z' },
  { stationId: 'PUN_03', stationName: 'IMD Lohegaon Airport', lat: 18.5822, lng: 73.9197, rainfallMm: 68.2, durationHrs: 5.0, source: 'IMD Aviation Met Office', timestamp: '2026-10-30T08:00:00Z' },
  { stationId: 'PUN_04', stationName: 'IMD Chinchwad PCMC', lat: 18.6298, lng: 73.7997, rainfallMm: 58.0, durationHrs: 4.5, source: 'PCMC Disaster Cell', timestamp: '2026-10-30T08:00:00Z' },
  { stationId: 'PUN_05', stationName: 'Khadakwasla Dam Catchment', lat: 18.4357, lng: 73.7634, rainfallMm: 88.0, durationHrs: 6.5, source: 'Central Water Commission (CWC)', timestamp: '2026-10-30T08:00:00Z' },
  { stationId: 'PUN_06', stationName: 'Mutha River Basin (Swargate)', lat: 18.5018, lng: 73.8580, rainfallMm: 64.0, durationHrs: 5.0, source: 'PMC Hydrology Dept', timestamp: '2026-10-30T08:00:00Z' }
];

export const INITIAL_HISTORICAL_FLOODS: HistoricalFlood[] = [
  { id: 'INC_2019_01', name: 'Ambil Odha Flash Flood', lat: 18.4980, lng: 73.8420, date: '2019-09-25', severity: 'Critical', waterLevelM: 2.4, roadAffected: 'Sinhagad Road / Aranyeshwar', source: 'PMC Disaster Analysis' },
  { id: 'INC_2019_02', name: 'Sinhagad Road Ekta Nagari Inundation', lat: 18.4850, lng: 73.8210, date: '2019-09-26', severity: 'Critical', waterLevelM: 2.8, roadAffected: 'Sinhagad Road Riverside', source: 'CWC Flood Bulletins' },
  { id: 'INC_2021_01', name: 'Mutha River Swelling (Bhide Bridge)', lat: 18.5175, lng: 73.8440, date: '2021-07-23', severity: 'High', waterLevelM: 1.8, roadAffected: 'Deccan Riverside Causeway', source: 'Irrigation Dept Discharge' },
  { id: 'INC_2023_01', name: 'Pavana River Inundation (Sangvi)', lat: 18.5880, lng: 73.8120, date: '2023-07-19', severity: 'High', waterLevelM: 1.5, roadAffected: 'Old Sangvi Bridge Road', source: 'PCMC Incident Log' }
];
