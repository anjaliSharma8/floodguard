import React, { useState } from 'react';
import { calculateFloodRisk } from '../utils/rules';
import { RainfallFeedMetadata } from '../types';
import {
  Database,
  Sliders,
  AlertTriangle,
  Info
} from 'lucide-react';

interface DatasetExplorerProps {
  rainfallFeed?: RainfallFeedMetadata | null;
}

export const DatasetExplorer: React.FC<DatasetExplorerProps> = ({ rainfallFeed }) => {
  // Interactive rule-based risk tester
  const [rainfallMm, setRainfallMm] = useState<string>('45');
  const [elevationM, setElevationM] = useState<string>('555');
  const [slopePct, setSlopePct] = useState<number>(1.2);
  const [drainage, setDrainage] = useState<string>('moderate');
  const [hasHistory, setHasHistory] = useState<boolean>(true);
  const [communityScore, setCommunityScore] = useState<string>('65');

  const parsedRainfall = rainfallMm === '' ? null : Number(rainfallMm);
  const parsedElevation = elevationM === '' ? null : Number(elevationM);
  const parsedCommunity = communityScore === '' ? null : Number(communityScore);

  const riskResult = calculateFloodRisk({
    rainfallMm: parsedRainfall,
    elevationM: parsedElevation,
    slopePct,
    drainageCondition: drainage,
    hasHistoricalFlood: hasHistory,
    communityRiskScore: parsedCommunity,
    rainfallTimestamp: new Date().toISOString()
  });

  const imdStatusLabel =
    rainfallFeed?.imdApiStatus === 'CONFIGURED'
      ? 'Configured'
      : 'Unavailable (IMD_API_KEY not configured)';

  const datasets = [
    {
      name: 'Live & Forecast Precipitation',
      file: 'src/services/weatherService.ts',
      source: `Open-Meteo Weather API (live) • IMD Feed: ${imdStatusLabel}`,
      records: '7 Pune & PCMC Gauge Stations (observed 24h, current hour, 24h forecast)',
      badge: 'Live API'
    },
    {
      name: 'Directed Road Network Graph',
      file: 'datasets/processed/roads.geojson',
      source: 'OpenStreetMap (OSM) & OSRM Real Corridor Geometries',
      records: '32 Pune/PCMC Intersections (Nodes), 46 Directed Corridors with One-Way & Access Tags',
      badge: 'Real Vector'
    },
    {
      name: 'Elevation & Terrain Slope',
      file: 'datasets/processed/terrain.csv',
      source: 'Copernicus DEM GLO-90 (30m-class global elevation sampling)',
      records: 'Node & corridor elevations across Mutha, Mula & Pavana river basins',
      badge: 'Real DEM'
    },
    {
      name: 'Waterways & Drainage Inventory',
      file: 'datasets/processed/drainage.csv',
      source: 'OSM Waterways (Mutha, Mula, Pavana, Ambil Odha, Nagzari)',
      records: 'Channel locations & inspection status; quantitative capacity marked unknown (capacityKnown=false)',
      badge: 'Verified Partial'
    },
    {
      name: 'Historical Flood Incidents',
      file: 'datasets/processed/historical_floods.csv',
      source: 'Pune Municipal Corporation (PMC) & CWC Historical Records',
      records: 'Verified past floods (2019 Ambil Odha / Sinhagad Rd, 2021 Mutha Swell, 2023–2024 Pavana)',
      badge: 'Historical'
    },
    {
      name: 'Emergency Shelters, Hospitals & Rescue',
      file: 'datasets/processed/shelters.csv & hospitals.csv',
      source: 'PMC / PCMC Disaster Management & RESQ Charitable Trust Directories',
      records: 'Verified shelters (pet-friendly & step-free flags), trauma hospitals & 24x7 dispatch units',
      badge: 'Directory'
    }
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-blue-600/20 text-cyan-400 rounded-xl border border-cyan-500/30">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">SanketSetu Data Lineage & Transparent Risk Formula</h2>
            <p className="text-xs text-slate-400">OSM/OSRM Road Graph, Copernicus DEM, Open-Meteo Telemetry & Rule-Based Scoring</p>
          </div>
        </div>
        <span className="text-[11px] bg-slate-800 text-cyan-300 border border-slate-700 px-2.5 py-1 rounded-full font-mono">
          IMD Status: {rainfallFeed?.imdApiStatus || 'KEY_MISSING'}
        </span>
      </div>

      {/* Honest Data Completeness Disclosure */}
      <div className="p-3 bg-blue-950/40 border border-blue-900/70 rounded-xl text-xs text-slate-300 flex items-start space-x-2">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          SanketSetu uses a <strong>rule-based weighted index</strong> (not a trained black-box ML model). Real-time rainfall uses Open-Meteo; where gauge/sensor or stormwater culvert capacity values are unavailable (e.g., <code className="text-cyan-300">IMD_API_KEY</code> unset or <code className="text-cyan-300">capacityKnown=false</code>), the engine flags the missing factors and lowers <code className="text-cyan-300">confidenceScore</code> instead of substituting zero risk.
        </p>
      </div>

      {/* Dataset Catalog */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Verified Pune & PCMC Datasets</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
            <thead className="bg-slate-800/80 text-slate-300 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="p-2.5">Dataset Name</th>
                <th className="p-2.5">File Path</th>
                <th className="p-2.5">Source Attribution</th>
                <th className="p-2.5">Coverage & Limitations</th>
                <th className="p-2.5">Status</th>
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
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 whitespace-nowrap">
                      {d.badge}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* EXPLAINABLE RISK ENGINE FORMULA TESTER */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/80 pb-2">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Interactive Rule-Based Risk Formula Tester
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            R = 0.30·Rain + 0.20·Terrain + 0.15·Drain + 0.15·History + 0.20·Community
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-slate-300 font-semibold">
                Rainfall (mm): <strong className="text-cyan-300">{parsedRainfall ?? 'Missing'}</strong>
              </label>
              <button
                type="button"
                onClick={() => setRainfallMm(prev => (prev === '' ? '45' : ''))}
                className="text-[10px] text-cyan-400 hover:underline"
              >
                {rainfallMm === '' ? 'Set 45mm' : 'Test Missing'}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="150"
              value={parsedRainfall ?? 0}
              onChange={(e) => setRainfallMm(e.target.value)}
              className="w-full accent-cyan-500 h-1.5 bg-slate-700 rounded"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-slate-300 font-semibold">
                Elevation (m): <strong className="text-cyan-300">{parsedElevation ?? 'Missing'}</strong>
              </label>
              <button
                type="button"
                onClick={() => setElevationM(prev => (prev === '' ? '555' : ''))}
                className="text-[10px] text-cyan-400 hover:underline"
              >
                {elevationM === '' ? 'Set 555m' : 'Test Missing'}
              </button>
            </div>
            <input
              type="range"
              min="540"
              max="625"
              value={parsedElevation ?? 555}
              onChange={(e) => setElevationM(e.target.value)}
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
              <option value="good">Good (15 risk score)</option>
              <option value="moderate">Moderate (45 risk score)</option>
              <option value="poor">Poor (90 risk score)</option>
              <option value="clogged">Clogged (85 risk score)</option>
              <option value="unknown">Unknown (Precautionary 55)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Historical Flood Record</label>
            <select
              value={hasHistory ? 'true' : 'false'}
              onChange={(e) => setHasHistory(e.target.value === 'true')}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-1.5 text-slate-200"
            >
              <option value="true">Yes (Documented Zone: 85)</option>
              <option value="false">No (No Record: 15)</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-slate-300 font-semibold">
                Community Signal: <strong className="text-cyan-300">{parsedCommunity ?? 'Missing'}</strong>
              </label>
              <button
                type="button"
                onClick={() => setCommunityScore(prev => (prev === '' ? '65' : ''))}
                className="text-[10px] text-cyan-400 hover:underline"
              >
                {communityScore === '' ? 'Set 65' : 'Test Missing'}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={parsedCommunity ?? 0}
              onChange={(e) => setCommunityScore(e.target.value)}
              className="w-full accent-cyan-500 h-1.5 bg-slate-700 rounded"
            />
          </div>
        </div>

        {/* Live Calculation Output Card */}
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="space-y-1.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">Computed Risk Assessment</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-black" style={{ color: riskResult.color }}>
                {riskResult.riskScore !== null ? `${riskResult.riskScore} / 100` : 'Unknown'}
              </span>
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white shadow"
                style={{ backgroundColor: riskResult.color }}
              >
                {riskResult.category} Risk
              </span>
              <span className="text-[11px] bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-slate-300">
                Confidence: <strong>{Math.round(riskResult.confidenceScore * 100)}%</strong> ({riskResult.dataCompletenessPct}% complete)
              </span>
            </div>
            <p className="text-[11px] text-slate-300 max-w-xl">{riskResult.explainability}</p>
            {riskResult.contradictionDetected && riskResult.contradictionNote && (
              <div className="text-[11px] text-amber-300 flex items-center space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{riskResult.contradictionNote}</span>
              </div>
            )}
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
