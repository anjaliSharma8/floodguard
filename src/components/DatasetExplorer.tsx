import React, { useState } from 'react';
import { calculateFloodRisk, DEFAULT_WEIGHTS } from '../utils/rules';
import { 
  Database, 
  FileCode, 
  ExternalLink, 
  Sliders, 
  FolderTree, 
  CheckCircle, 
  AlertCircle,
  HelpCircle
} from 'lucide-react';

export const DatasetExplorer: React.FC = () => {
  // Interactive formula tester
  const [rainfallMm, setRainfallMm] = useState<number>(45);
  const [elevationM, setElevationM] = useState<number>(555);
  const [slopePct, setSlopePct] = useState<number>(1.2);
  const [drainage, setDrainage] = useState<string>('moderate');
  const [hasHistory, setHasHistory] = useState<boolean>(true);
  const [communityScore, setCommunityScore] = useState<number>(65);

  const riskResult = calculateFloodRisk({
    rainfallMm,
    elevationM,
    slopePct,
    drainageCondition: drainage,
    hasHistoricalFlood: hasHistory,
    communityRiskScore: communityScore
  });

  const datasets = [
    {
      name: 'Rainfall Observations',
      file: 'datasets/processed/rainfall.csv',
      source: 'India Meteorological Department (IMD) & Central Water Commission (CWC)',
      records: '8 Stations (Shivajinagar, Pashan, Airport, Chinchwad, Khadakwasla Dam)',
      resolution: 'Point Sensor / AWS (Hourly Telemetry)',
      type: 'Real Data'
    },
    {
      name: 'Road Network Graph',
      file: 'datasets/processed/roads.geojson',
      source: 'OpenStreetMap Contributors & Geofabrik India Extract',
      records: '13 Intersections (Nodes), 16 Thoroughfare Edges (FC Rd, Sinhagad Rd, Karve Rd)',
      resolution: 'Vector Geometry with Speed, Elevation & Drainage metadata',
      type: 'Real Data'
    },
    {
      name: 'Elevation & Terrain Slope',
      file: 'datasets/processed/terrain.csv',
      source: 'NASA Shuttle Radar Topography Mission (SRTM 30m Global)',
      records: '8 Pune City Sectors (546m riverbed to 620m Katraj ridge)',
      resolution: '30-metre DEM Grid',
      type: 'Real Data'
    },
    {
      name: 'Historical Flood Incidents',
      file: 'datasets/processed/historical_floods.csv',
      source: 'Pune Municipal Corporation (PMC) & CWC Flood Bulletins',
      records: 'Documented 2019 Sinhagad Flash Floods, 2021 Mutha Swell, 2023 Pavana Inundation',
      resolution: 'Incident Coordinates & Gauge Crest Water Levels',
      type: 'Real Data'
    },
    {
      name: 'Emergency Shelters & Hospitals',
      file: 'datasets/processed/shelters.csv & hospitals.csv',
      source: 'PMC Disaster Management & District Administration Directories',
      records: '6 Community Shelters, 6 Major Hospitals (Sassoon, Ruby Hall, YCM, Deenanath)',
      resolution: 'Coordinates, ICU Capacity, Pet Friendly & Wheelchair Access Status',
      type: 'Real Data'
    },
    {
      name: 'Animal Rescue Directory',
      file: 'datasets/processed/emergency_facilities.csv',
      source: 'RESQ Charitable Trust, SPCA Pune & Bodhisattva',
      records: '3 Specialized Wildlife/Domestic Animal Flood Rescue Units',
      resolution: '24x7 Hotlines & Boat Rescue Dispatch Units',
      type: 'Real Data'
    },
    {
      name: 'Synthetic Scenario Demonstrations',
      file: 'datasets/synthetic/synthetic_demo_data.csv',
      source: 'Synthetic Simulation Engine for Catastrophic 150mm Cloudbursts',
      records: '4 Boundary Test Scenarios (145mm cloudburst, 45,000 cfs dam release)',
      resolution: 'Stress-testing routing fallbacks under extreme hypothetical conditions',
      type: 'Synthetic Demo'
    }
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 space-y-6">
      {/* Title */}
      <div className="flex items-center space-x-2.5 border-b border-slate-800 pb-3">
        <div className="p-2 bg-blue-600/20 text-cyan-400 rounded-xl border border-cyan-500/30">
          <Database className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white tracking-wide">Section 3 Dataset Architecture & Risk Formula</h2>
          <p className="text-xs text-slate-400">OpenStreetMap, IMD Rainfall, NASA SRTM Elevation & Explainable Engine</p>
        </div>
      </div>

      {/* Dataset Catalog */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Integrated Pune Datasets</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
            <thead className="bg-slate-800/80 text-slate-300 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="p-2.5">Dataset Name</th>
                <th className="p-2.5">File Path</th>
                <th className="p-2.5">Source Attribution</th>
                <th className="p-2.5">Coverage</th>
                <th className="p-2.5">Class</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
              {datasets.map((d, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="p-2.5 font-bold text-white">{d.name}</td>
                  <td className="p-2.5 font-mono text-cyan-400 text-[11px]">{d.file}</td>
                  <td className="p-2.5 text-slate-300">{d.source}</td>
                  <td className="p-2.5 text-slate-400">{d.records}</td>
                  <td className="p-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      d.type === 'Real Data' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-300'
                    }`}>
                      {d.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: EXPLAINABLE RISK ENGINE FORMULA TESTER */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Interactive Explainable Risk Engine Tester
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Risk = W1·R + W2·T + W3·D + W4·H + W5·C
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Rainfall (mm): <strong className="text-cyan-300">{rainfallMm} mm</strong>
            </label>
            <input
              type="range"
              min="0"
              max="150"
              value={rainfallMm}
              onChange={(e) => setRainfallMm(Number(e.target.value))}
              className="w-full accent-cyan-500 h-1.5 bg-slate-700 rounded"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Elevation (m): <strong className="text-cyan-300">{elevationM} m</strong>
            </label>
            <input
              type="range"
              min="540"
              max="620"
              value={elevationM}
              onChange={(e) => setElevationM(Number(e.target.value))}
              className="w-full accent-cyan-500 h-1.5 bg-slate-700 rounded"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Terrain Slope (%): <strong className="text-cyan-300">{slopePct}%</strong>
            </label>
            <input
              type="range"
              min="0.2"
              max="5.0"
              step="0.1"
              value={slopePct}
              onChange={(e) => setSlopePct(Number(e.target.value))}
              className="w-full accent-cyan-500 h-1.5 bg-slate-700 rounded"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Drainage Condition</label>
            <select
              value={drainage}
              onChange={(e) => setDrainage(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-1.5 text-slate-200"
            >
              <option value="good">Good (15% penalty)</option>
              <option value="moderate">Moderate (45% penalty)</option>
              <option value="poor">Poor (90% penalty)</option>
              <option value="clogged">Clogged (85% penalty)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Historical Flood Inundation</label>
            <select
              value={hasHistory ? 'true' : 'false'}
              onChange={(e) => setHasHistory(e.target.value === 'true')}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-1.5 text-slate-200"
            >
              <option value="true">Yes (Proven Flood Zone: 85%)</option>
              <option value="false">No (Unrecorded Zone: 15%)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Community Citizen Reports: <strong className="text-cyan-300">{communityScore}%</strong>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={communityScore}
              onChange={(e) => setCommunityScore(Number(e.target.value))}
              className="w-full accent-cyan-500 h-1.5 bg-slate-700 rounded"
            />
          </div>
        </div>

        {/* Live Calculation Output Card */}
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Computed Risk Assessment</span>
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-black" style={{ color: riskResult.color }}>
                {riskResult.riskScore} / 100
              </span>
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white shadow"
                style={{ backgroundColor: riskResult.color }}
              >
                {riskResult.category} Risk
              </span>
            </div>
            <p className="text-[11px] text-slate-300 max-w-xl">{riskResult.explainability}</p>
          </div>

          {/* Factor Breakdown Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px] shrink-0">
            <div className="bg-slate-800 p-1.5 rounded border border-slate-700 text-center">
              <span className="text-slate-400 block">Rainfall (30%)</span>
              <strong className="text-white text-xs">{riskResult.factors.rainfallRisk}</strong>
            </div>
            <div className="bg-slate-800 p-1.5 rounded border border-slate-700 text-center">
              <span className="text-slate-400 block">Terrain (20%)</span>
              <strong className="text-white text-xs">{riskResult.factors.terrainRisk}</strong>
            </div>
            <div className="bg-slate-800 p-1.5 rounded border border-slate-700 text-center">
              <span className="text-slate-400 block">Drainage (15%)</span>
              <strong className="text-white text-xs">{riskResult.factors.drainageRisk}</strong>
            </div>
            <div className="bg-slate-800 p-1.5 rounded border border-slate-700 text-center">
              <span className="text-slate-400 block">History (15%)</span>
              <strong className="text-white text-xs">{riskResult.factors.historicalRisk}</strong>
            </div>
            <div className="bg-slate-800 p-1.5 rounded border border-slate-700 text-center col-span-2 sm:col-span-1">
              <span className="text-slate-400 block">Community (20%)</span>
              <strong className="text-white text-xs">{riskResult.factors.communityRisk}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
