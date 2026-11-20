import React, { useState, useEffect } from 'react';
import { calculateFloodRisk } from '../utils/rules';
import { INITIAL_HISTORICAL_FLOODS, INITIAL_WATERWAYS } from '../data/puneData';
import { RainfallFeedMetadata, TrafficFeedStatus, User, OsmSyncLog } from '../types';
import {
  Database,
  Sliders,
  AlertTriangle,
  Info,
  CloudRain,
  Clock,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Route,
  MapPin,
  CheckCircle,
  XCircle,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';

interface NetworkStatus {
  provider: string;
  syncMode: string;
  externalFetchEnabled: boolean;
  statusMessage: string;
  syncIntervalHours: number;
  syncEnabled: boolean;
  nodesCount: number;
  edgesCount: number;
  lastSync: OsmSyncLog | null;
  recentLogs?: OsmSyncLog[];
  timestamp: string;
}

interface DatasetExplorerProps {
  rainfallFeed?: RainfallFeedMetadata | null;
  user?: User;
  token?: string;
  deviceOnline: boolean;
  backendAvailable: boolean | null;
  lastLiveDataUpdate: string | null;
  operationalDataState: 'LIVE' | 'CACHED' | 'UNAVAILABLE';
  rainfallDataState: 'LIVE' | 'CACHED' | 'UNAVAILABLE';
  onRefreshData?: () => void;
}

const HISTORICAL_FLOOD_SOURCES = Array.from(
  new Set(INITIAL_HISTORICAL_FLOODS.map(record => record.source))
).join(', ');

export const DatasetExplorer: React.FC<DatasetExplorerProps> = ({
  rainfallFeed,
  user,
  token,
  deviceOnline,
  backendAvailable,
  lastLiveDataUpdate,
  operationalDataState,
  rainfallDataState,
  onRefreshData
}) => {
  // Local OSM-derived graph status and manual refresh state
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [trafficStatus, setTrafficStatus] = useState<TrafficFeedStatus | null>(null);
  const [networkStatusError, setNetworkStatusError] = useState<string | null>(null);
  const [trafficStatusError, setTrafficStatusError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchNetworkStatus = async () => {
    try {
      const res = await fetch('/api/network/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (!res.ok) throw new Error(`Network status request failed with HTTP ${res.status}`);
      setNetworkStatus(await res.json() as NetworkStatus);
      setNetworkStatusError(null);
    } catch (err) {
      setNetworkStatus(null);
      setNetworkStatusError(err instanceof Error ? err.message : String(err));
    }
  };

  const fetchTrafficStatus = async () => {
    try {
      const res = await fetch('/api/traffic/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (!res.ok) throw new Error(`Traffic status request failed with HTTP ${res.status}`);
      setTrafficStatus(await res.json() as TrafficFeedStatus);
      setTrafficStatusError(null);
    } catch (err) {
      setTrafficStatus(null);
      setTrafficStatusError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void fetchNetworkStatus();
    void fetchTrafficStatus();
  }, [token]);

  const handleManualSync = async () => {
    if (!deviceOnline || backendAvailable !== true) {
      setSyncFeedback({ text: 'Connect to the live backend before validating the local graph.', isError: true });
      return;
    }
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const effectiveToken = token || localStorage.getItem('sanketsetu_token') || '';
      const res = await fetch('/api/expert/network/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveToken}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSyncFeedback({
          text: data.error || data.message || 'Local graph refresh failed. Topology validation rejected the candidate.',
          isError: true
        });
      } else {
        setSyncFeedback({
          text: `Bundled OSM-derived graph refreshed and validated: ${data.nodesCount} nodes, ${data.edgesCount} corridors.`,
          isError: false
        });
        await fetchNetworkStatus();
        if (onRefreshData) onRefreshData();
      }
    } catch (err: any) {
      setSyncFeedback({
        text: 'Failed to communicate with graph refresh endpoint: ' + (err.message || String(err)),
        isError: true
      });
    } finally {
      setIsSyncing(false);
    }
  };

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
    rainfallTimestamp: null
  });

  const weatherLastUpdated = rainfallFeed?.lastSuccessfulUpdate
    ? new Date(rainfallFeed.lastSuccessfulUpdate).toLocaleString()
    : 'Unknown';
  const weatherIsAvailable = rainfallFeed?.openMeteoStatus === 'OK' && rainfallDataState !== 'UNAVAILABLE';
  const trafficLastUpdated = trafficStatus?.lastSuccessfulUpdate
    ? new Date(trafficStatus.lastSuccessfulUpdate).toLocaleString()
    : typeof trafficStatus?.liveSegments === 'number'
      ? trafficStatus.lastChecked
      ? `Last attempt ${new Date(trafficStatus.lastChecked).toLocaleString()}`
        : 'Unknown'
      : trafficStatus
        ? 'Unknown'
        : 'Unavailable';
  const hasAccurateTrafficStatus =
    typeof trafficStatus?.liveSegments === 'number' &&
    typeof trafficStatus.cachedSegments === 'number';

  const lastSuccessfulOsmSync = networkStatus?.lastSync?.status === 'SUCCESS'
    ? networkStatus.lastSync
    : networkStatus?.recentLogs?.find(log => log.status === 'SUCCESS') ?? null;
  const lastSyncTimestamp = lastSuccessfulOsmSync?.syncTimestamp || lastSuccessfulOsmSync?.createdAt;
  const osmLastUpdated = lastSyncTimestamp
    ? new Date(lastSyncTimestamp).toLocaleString()
    : 'Unknown';

  const isExpert = user?.role === 'EXPERT' && user.accountStatus === 'ACTIVE';
  const isBackendConnected = deviceOnline && backendAvailable === true;

  const datasets = [
    {
      name: 'Gridded Precipitation (Past, Current & Forecast)',
      file: 'src/services/weatherService.ts',
      source: 'Open-Meteo Forecast API (~11 km hourly grid); direct IMD station data is not queried',
      lastUpdated: weatherLastUpdated,
      freshness: weatherIsAvailable
        ? rainfallDataState === 'CACHED' ? 'CACHED_MODEL_ESTIMATE' : 'MODEL_ESTIMATE'
        : 'UNAVAILABLE',
      confidence: weatherIsAvailable ? 'Unverified; not gauge-verified' : 'Unverified',
      coverage: '9 Pune & PCMC grid points; past-24h model estimates, current-hour estimate and next-24h forecast (not gauges)',
      badge: rainfallFeed?.openMeteoStatus === 'OK' ? 'API responded' : 'Unavailable'
    },
    {
      name: 'OpenStreetMap-Derived Local Road Graph',
      file: 'src/services/osmSyncService.ts & sanketsetu.db',
      source: 'Bundled ODbL-derived snapshot; scheduled local refresh (no runtime Overpass fetch)',
      lastUpdated: osmLastUpdated,
      freshness: lastSuccessfulOsmSync ? 'VALIDATED_LOCAL' : 'BUNDLED_BASELINE',
      confidence: 'Topology validation only',
      coverage: `${networkStatus?.nodesCount ?? 'Unknown'} Nodes, ${networkStatus?.edgesCount ?? 'Unknown'} Bundled Road Segments (One-Way & Turn Constrained)`,
      badge: networkStatus?.lastSync?.status === 'SUCCESS' ? 'Local graph validated' : 'Bundled graph'
    },
    {
      name: 'Elevation & Terrain Slope',
      file: 'src/data/roads.json (bundled road attributes)',
      source: 'Bundled road attributes; upstream elevation and slope source is not recorded',
      lastUpdated: 'Unknown',
      freshness: 'UNKNOWN',
      confidence: 'Unverified',
      coverage: 'Stored baseline elevation and slope attributes; no terrain survey timestamp is available',
      badge: 'Provenance unknown'
    },
    {
      name: 'TomTom Traffic Flow & Estimated Speeds',
      file: 'src/services/trafficService.ts',
      source: trafficStatus?.provider || 'Provider not confirmed',
      lastUpdated: trafficLastUpdated,
      freshness: hasAccurateTrafficStatus
        ? trafficStatus.isLiveActive ? 'LIVE' : 'ESTIMATED'
        : trafficStatus ? 'STATUS_UPDATE_REQUIRED' : 'UNAVAILABLE',
      confidence: 'Per-response only; no aggregate score',
      coverage: hasAccurateTrafficStatus
        ? `${trafficStatus.liveSegments} recent live segments; ${trafficStatus.cachedSegments} cached segments; ${networkStatus?.edgesCount ?? 'unknown'} network segments`
        : trafficStatus
          ? 'Current backend does not report recent successful segment counts'
          : 'Traffic status has not been confirmed',
      badge: hasAccurateTrafficStatus
        ? trafficStatus.isLiveActive ? 'Recent API success' : 'Estimated baseline'
        : trafficStatus ? 'Backend restart required' : 'Status unavailable'
    },
    {
      name: 'Waterways & Drainage Inventory',
      file: 'src/data/puneData.ts (waterway inventory)',
      source: Array.from(new Set(INITIAL_WATERWAYS.map(waterway => waterway.source).filter(Boolean))).join('; ') || 'Unknown',
      lastUpdated: 'Unknown',
      freshness: 'UNKNOWN',
      confidence: 'Unverified',
      coverage: 'Channel locations & inspection status; quantitative capacity marked unknown (capacityKnown=false)',
      badge: 'Partial inventory'
    },
    {
      name: 'Historical Flood Incidents',
      file: 'src/data/puneData.ts (historical records)',
      source: HISTORICAL_FLOOD_SOURCES || 'Unknown',
      lastUpdated: 'Unknown',
      freshness: 'HISTORICAL',
      confidence: 'Unverified',
      coverage: INITIAL_HISTORICAL_FLOODS.map(record => `${record.name} (${record.date})`).join('; '),
      badge: 'Historical'
    },
    {
      name: 'Emergency Shelters, Hospitals & Rescue',
      file: 'src/data/puneData.ts; shelter and hospital APIs',
      source: 'Source attribution is not recorded in the bundled directory records',
      lastUpdated: 'Unknown',
      freshness: 'UNKNOWN',
      confidence: 'Unverified',
      coverage: 'Directory entries only; current shelter occupancy and hospital availability are not connected',
      badge: 'Availability unknown'
    },
    {
      name: 'Community Field Reports & Hazards',
      file: 'data/sanketsetu.db (SQLite)',
      source: 'Citizen-submitted observations with strict Expert verification audit trail',
      lastUpdated: operationalDataState === 'UNAVAILABLE'
        ? 'Unknown'
        : lastLiveDataUpdate ? `Backend response ${new Date(lastLiveDataUpdate).toLocaleString()}` : 'Unknown',
      freshness: operationalDataState,
      confidence: 'Per-report verification status; no aggregate score',
      coverage: 'Geo-tagged waterlogging, tree falls, and verified road closures with operational audit log',
      badge: operationalDataState === 'LIVE' ? 'Backend response received' : operationalDataState
    }
  ];

  return (
    <div className="min-w-0 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-blue-600/20 text-cyan-400 rounded-xl border border-cyan-500/30">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">SanketSetu Data Lineage, Telemetry & Transparent Scoring</h2>
            <p className="text-xs text-slate-400">Local OSM-derived graph validation, Open-Meteo estimates, TomTom Traffic & Copernicus DEM</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2.5 py-1 rounded-full font-mono border ${
            networkStatus?.lastSync?.status === 'SUCCESS' || networkStatus?.nodesCount
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700'
              : 'bg-amber-950/60 text-amber-300 border-amber-700'
          }`}>
            OSM: {networkStatus?.lastSync?.status === 'SUCCESS' ? 'LOCAL GRAPH VALIDATED' : 'BUNDLED SNAPSHOT'}
          </span>
          <span className={`text-[11px] px-2.5 py-1 rounded-full font-mono border ${
            rainfallFeed?.openMeteoStatus === 'OK'
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700'
              : 'bg-amber-950/60 text-amber-300 border-amber-700'
          }`}>
            Weather: {weatherIsAvailable ? `${rainfallDataState} MODEL ESTIMATES` : 'UNAVAILABLE'}
          </span>
          <span className="text-[11px] bg-slate-800 text-cyan-300 border border-slate-700 px-2.5 py-1 rounded-full font-mono">
            IMD: {rainfallFeed?.imdApiStatus || 'KEY_MISSING'}
          </span>
        </div>
      </div>

      {(networkStatusError || trafficStatusError) && (
        <div role="alert" className="rounded-xl border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          {networkStatusError && <p>Road graph diagnostics unavailable: {networkStatusError}</p>}
          {trafficStatusError && <p>Traffic diagnostics unavailable: {trafficStatusError}</p>}
        </div>
      )}

      {/* Honest Data Completeness Disclosure */}
      <div className="p-3 bg-blue-950/40 border border-blue-900/70 rounded-xl text-xs text-slate-300 flex items-start space-x-2">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          SanketSetu uses a <strong>rule-based weighted index</strong> (not a trained black-box ML model). Open-Meteo supplies gridded precipitation estimates across 9 regional grid points; these are not gauge observations, and direct IMD station data is not currently queried. Shelter occupancy and hospital availability are not live feeds, and terrain provenance is not recorded for bundled road attributes. The scheduled OSM-derived graph task refreshes and validates the bundled snapshot locally; it does not fetch current Overpass data. The system <strong>does not fabricate missing weather readings</strong>.
        </p>
      </div>

      {/* LOCAL OSM-DERIVED GRAPH STATUS */}
      <div className="bg-slate-800/40 border border-slate-700/80 rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/80 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <Route className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                OpenStreetMap-Derived Local Road Graph
              </h3>
              <p className="text-[11px] text-slate-400">
                Scheduled local refresh • Deterministic ID Mapping • Topology Validation (no Overpass fetch)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-indigo-300 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Refresh interval: {networkStatus?.syncIntervalHours ?? 'Unknown'} Hours</span>
            </span>

            {isExpert && (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing || !isBackendConnected}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition shadow"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Validating local graph...' : 'Refresh Local Graph'}</span>
              </button>
            )}
          </div>
        </div>

        {syncFeedback && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center space-x-2 border ${
              syncFeedback.isError
                ? 'bg-rose-950/60 border-rose-800 text-rose-200'
                : 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
            }`}
          >
            {syncFeedback.isError ? (
              <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            )}
            <span>{syncFeedback.text}</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1">
            <span className="text-slate-400 block text-[10px] uppercase font-mono">Validation Status</span>
            <div className="flex items-center space-x-1.5">
              <CheckCircle2 className={`w-3.5 h-3.5 ${
                networkStatus?.lastSync?.status === 'SUCCESS' ? 'text-emerald-400' : 'text-amber-400'
              }`} />
              <strong className={`font-mono text-xs ${
                networkStatus?.lastSync?.status === 'SUCCESS' ? 'text-emerald-300' : 'text-amber-300'
              }`}>
                {networkStatus?.lastSync?.status || 'UNKNOWN'}
              </strong>
            </div>
            <span className="text-[10px] text-slate-400 block truncate">
              Source: Bundled canonical graph
            </span>
          </div>

          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1">
            <span className="text-slate-400 block text-[10px] uppercase font-mono">Last Successful Validation</span>
            <strong className="text-white font-mono text-xs block truncate">
              {lastSyncTimestamp
                ? new Date(lastSyncTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : 'Unknown'}
            </strong>
            <span className="text-[10px] text-slate-400 block truncate">
              {lastSyncTimestamp
                ? new Date(lastSyncTimestamp).toLocaleDateString()
                : 'No synchronization timestamp'}
            </span>
          </div>

          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1">
            <span className="text-slate-400 block text-[10px] uppercase font-mono">Active Topology</span>
            <strong className="text-cyan-300 font-mono text-xs block">
              {networkStatus?.nodesCount ?? 'Unknown'} Nodes / {networkStatus?.edgesCount ?? 'Unknown'} Edges
            </strong>
            <span className="text-[10px] text-slate-400 block">
              {networkStatus?.lastSync
                ? `${networkStatus.lastSync.roadsPreserved} roads preserved in last sync`
                : 'No synchronization log available'}
            </span>
          </div>

          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1">
            <span className="text-slate-400 block text-[10px] uppercase font-mono">Vehicle Constraints</span>
            <strong className="text-indigo-300 font-mono text-xs block">
              Exclusions Enforced
            </strong>
            <span className="text-[10px] text-slate-400 block truncate">
              Pedestrian / aisles excluded
            </span>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 flex flex-col xl:flex-row xl:items-center justify-between gap-1 pt-1 border-t border-slate-800/80">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Preservation Guarantee: Existing road IDs (<code className="text-cyan-300">R01–R108</code>) and expert hazard closures (<code className="text-amber-300">R08</code>) are preserved by the local graph refresh.
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-400 shrink-0">
            Provider: Bundled OpenStreetMap-derived graph
            {' • '}{networkStatus?.statusMessage || 'Runtime Overpass fetching is disabled.'}
          </span>
        </div>
      </div>

      {/* Dataset Catalog Table with Full Lineage */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Configured Dataset Catalog (Source, Timestamp, Freshness & Confidence)</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
            <thead className="bg-slate-800/80 text-slate-300 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="p-2.5">Dataset</th>
                <th className="p-2.5">Source Attribution</th>
                <th className="p-2.5">Last Updated</th>
                <th className="p-2.5">Freshness</th>
                <th className="p-2.5">Confidence</th>
                <th className="p-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
              {datasets.map((d, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="p-2.5">
                    <div className="font-bold text-white">{d.name}</div>
                    <div className="font-mono text-cyan-400 text-[10px] truncate max-w-xs">{d.file}</div>
                  </td>
                  <td className="p-2.5">
                    <div className="text-slate-300">{d.source}</div>
                    <div className="text-slate-400 text-[10px]">{d.coverage}</div>
                  </td>
                  <td className="p-2.5 font-mono text-slate-300 whitespace-nowrap">{d.lastUpdated}</td>
                  <td className="p-2.5">
                    <span className="font-mono text-[10px] text-cyan-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                      {d.freshness}
                    </span>
                  </td>
                  <td className="p-2.5 font-bold text-emerald-400">{d.confidence}</td>
                  <td className="p-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                      d.freshness === 'UNAVAILABLE' || d.freshness === 'UNKNOWN' || d.freshness === 'UNAVAILABLE'
                        ? 'bg-amber-500/20 text-amber-300'
                        : d.freshness.startsWith('CACHED')
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {d.badge}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* GRIDDED WEATHER ESTIMATES */}
      <div className="space-y-3 bg-slate-800/40 border border-slate-700/80 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/80 pb-2">
          <div className="flex items-center space-x-2">
            <CloudRain className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Open-Meteo Estimates Across 9 Pune & PCMC Grid Points
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Feed Status:{' '}
            <strong className={rainfallFeed?.openMeteoStatus === 'OK' ? 'text-emerald-400' : 'text-amber-400'}>
              {rainfallFeed?.openMeteoStatus === 'OK' ? 'Model estimates available' : 'Unavailable'}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(rainfallFeed?.observations || []).map((obs) => (
            <div
              key={obs.stationId}
              className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                obs.isAvailable
                  ? 'bg-slate-900/90 border-slate-700 text-slate-200'
                  : 'bg-slate-900/50 border-slate-800 text-slate-400'
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-bold text-white text-xs truncate" title={obs.stationName}>
                  {obs.stationName}
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 ${
                    obs.isAvailable
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {obs.isAvailable ? 'MODEL_ESTIMATE' : 'UNAVAILABLE'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 text-[11px] pt-1 border-t border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[10px]">Past 24h</span>
                  <strong className="text-cyan-300">
                    {obs.observedPast24hMm !== null ? `${obs.observedPast24hMm.toFixed(1)} mm` : 'N/A'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Curr Hour</span>
                  <strong className="text-blue-300">
                    {obs.currentHourMm !== null ? `${obs.currentHourMm.toFixed(1)} mm` : 'N/A'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Forecast 24h</span>
                  <strong className="text-indigo-300">
                    {obs.forecastNext24hMm !== null ? `${obs.forecastNext24hMm.toFixed(1)} mm` : 'N/A'}
                  </strong>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
                <span className="truncate">Lat {obs.lat.toFixed(3)}, Lng {obs.lng.toFixed(3)}</span>
                <span className="shrink-0">{obs.timestamp ? new Date(obs.timestamp).toLocaleTimeString() : 'N/A'}</span>
              </div>
            </div>
          ))}
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
          <span className="text-[11px] text-slate-400">
            Formula: R = 0.30·F_rain + 0.20·F_terrain + 0.15·F_drain + 0.15·F_hist + 0.20·F_comm
          </span>
          <p className="text-[11px] text-amber-300">
            Default and edited values are scenario inputs only; this output is not a live operational risk score.
          </p>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 block">
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
              className="w-full accent-cyan-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 block">
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
              max="620"
              value={parsedElevation ?? 555}
              onChange={(e) => setElevationM(e.target.value)}
              className="w-full accent-cyan-500"
            />
          </div>

          <div>
            <label className="text-slate-300 block mb-1">
              Terrain Slope: <strong className="text-cyan-300">{slopePct}%</strong>
            </label>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={slopePct}
              onChange={(e) => setSlopePct(parseFloat(e.target.value))}
              className="w-full accent-cyan-500"
            />
          </div>

          <div>
            <label className="text-slate-300 block mb-1">Drainage Condition</label>
            <select
              value={drainage}
              onChange={(e) => setDrainage(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-slate-200 text-xs"
            >
              <option value="good">Good (Clean Outfall)</option>
              <option value="moderate">Moderate</option>
              <option value="poor">Poor (Chronic Backwater)</option>
              <option value="clogged">Clogged / Choked</option>
              <option value="unknown">Unknown (Precautionary)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-300 block mb-1">Historical Flood</label>
            <label className="flex items-center space-x-2 p-1.5 bg-slate-900 border border-slate-700 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={hasHistory}
                onChange={(e) => setHasHistory(e.target.checked)}
                className="rounded accent-cyan-500"
              />
              <span className="text-xs text-slate-200">Past Inundation</span>
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 block">
                Community: <strong className="text-cyan-300">{parsedCommunity ?? 'None'}</strong>
              </label>
              <button
                type="button"
                onClick={() => setCommunityScore(prev => (prev === '' ? '65' : ''))}
                className="text-[10px] text-cyan-400 hover:underline"
              >
                {communityScore === '' ? 'Set 65' : 'Clear'}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={parsedCommunity ?? 0}
              onChange={(e) => setCommunityScore(e.target.value)}
              className="w-full accent-cyan-500"
            />
          </div>
        </div>

        {/* Calculated Output Breakdown */}
        <div className="p-4 bg-slate-900/90 border border-slate-700/80 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-lg"
                style={{ backgroundColor: riskResult.color }}
              >
                {riskResult.riskScore ?? '?'}
              </div>
              <div>
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Calculated Risk: {riskResult.category}
                </span>
                <p className="text-xs text-slate-400">
                  Scenario confidence (not source confidence): <strong className="text-cyan-400">{Math.round(riskResult.confidenceScore * 100)}%</strong> • Input completeness: {riskResult.dataCompletenessPct}%
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700">
                Input status: <strong className="text-cyan-300">SIMULATED · NOT LIVE</strong>
              </span>
              {riskResult.contradictionDetected && (
                <span className="bg-amber-950/80 text-amber-300 px-2.5 py-1 rounded-lg border border-amber-700 flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Contradiction Flagged</span>
                </span>
              )}
            </div>
          </div>

          {/* Missing factor warnings */}
          {riskResult.missingFactors.length > 0 && (
            <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs text-amber-200">
              <strong>Precautionary Fallback Active:</strong> Missing observations for [{riskResult.missingFactors.join(', ')}].
              The system substituted precautionary baselines and lowered confidence rather than assuming zero risk.
            </div>
          )}

          {/* Factor Breakdown Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-800 text-center text-xs">
            <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/60">
              <span className="text-slate-400 block">Rainfall (30%)</span>
              <strong className="text-white text-xs">{riskResult.factors.rainfallRisk}</strong>
            </div>
            <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/60">
              <span className="text-slate-400 block">Terrain (20%)</span>
              <strong className="text-white text-xs">{riskResult.factors.terrainRisk}</strong>
            </div>
            <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/60">
              <span className="text-slate-400 block">Drainage (15%)</span>
              <strong className="text-white text-xs">{riskResult.factors.drainageRisk}</strong>
            </div>
            <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/60">
              <span className="text-slate-400 block">Historical (15%)</span>
              <strong className="text-white text-xs">{riskResult.factors.historicalRisk}</strong>
            </div>
            <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/60">
              <span className="text-slate-400 block">Community (20%)</span>
              <strong className="text-white text-xs">{riskResult.factors.communityRisk}</strong>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 italic">
            {riskResult.explainability}
          </p>
        </div>
      </div>
    </div>
  );
};
