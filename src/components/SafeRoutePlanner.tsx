import React, { useState, useEffect } from 'react';
import { RoadNode, RoadSegment, RouteFeedback, Language } from '../types';
import {
  calculateDijkstraRoute,
  calculateKShortestPaths,
  MultiRouteResponse,
  RouteCalculationResult,
  RouteMode
} from '../utils/rules';
import { TRANSLATIONS } from '../utils/i18n';
import { speakText } from '../utils/speech';
import {
  Navigation,
  ShieldCheck,
  AlertTriangle,
  Clock,
  MapPin,
  Sliders,
  Volume2,
  CheckCircle,
  RefreshCw,
  ArrowUpDown,
  LocateFixed,
  Search,
  Route as RouteIcon
} from 'lucide-react';

interface SafeRoutePlannerProps {
  nodes: Record<string, RoadNode>;
  roads: RoadSegment[];
  lang: Language;
  externalOriginId?: string;
  externalDestId?: string;
  onRouteCalculated: (result: MultiRouteResponse & { activeMode: RouteMode; altIndex?: number }) => void;
  onSubmitFeedback: (feedback: Partial<RouteFeedback>) => void;
}

interface GeocodeItem {
  label: string;
  sector: string;
  lat: number;
  lng: number;
  nodeId: string;
  source: string;
}

export const SafeRoutePlanner: React.FC<SafeRoutePlannerProps> = ({
  nodes,
  roads,
  lang,
  externalOriginId,
  externalDestId,
  onRouteCalculated,
  onSubmitFeedback
}) => {
  const t = TRANSLATIONS[lang];
  const nodeEntries = Object.values(nodes);

  const [originId, setOriginId] = useState<string>(externalOriginId || 'N_SHIVAJINAGAR');
  const [destId, setDestId] = useState<string>(externalDestId || 'N_SINHAGAD_RD');
  const [lambdaRisk, setLambdaRisk] = useState<number>(1.8);
  const [vehicleType, setVehicleType] = useState<'car' | 'two_wheeler' | 'heavy' | 'emergency'>('car');

  // Searchable geocode states
  const [searchTarget, setSearchTarget] = useState<'origin' | 'dest' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [routeBundle, setRouteBundle] = useState<MultiRouteResponse | null>(null);
  const [selectedRouteType, setSelectedRouteType] = useState<RouteMode>('safest');
  const [selectedAltIdx, setSelectedAltIdx] = useState<number>(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  // Route feedback modal state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [reachedSafely, setReachedSafely] = useState(true);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [rating, setRating] = useState(5);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  useEffect(() => {
    if (externalOriginId && nodes[externalOriginId]) setOriginId(externalOriginId);
  }, [externalOriginId, nodes]);

  useEffect(() => {
    if (externalDestId && nodes[externalDestId]) setDestId(externalDestId);
  }, [externalDestId, nodes]);

  useEffect(() => {
    if (!searchTarget || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        setSearchResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchTarget]);

  const handleCalculate = async () => {
    setIsCalculating(true);
    setRouteError(null);
    setSelectedAltIdx(0);

    try {
      const res = await fetch('/api/routes/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startNodeId: originId,
          targetNodeId: destId,
          lambdaRisk,
          vehicleType
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to compute route.');
      const bundle: MultiRouteResponse = data;
      setRouteBundle(bundle);
      onRouteCalculated({
        ...bundle,
        activeMode: selectedRouteType,
        altIndex: selectedRouteType === 'safest' ? 0 : undefined
      });
    } catch {
      // Offline / local fallback using authoritative shared rules.ts engine
      const graphEdges = roads.map(r => ({
        id: r.id,
        from: r.from,
        to: r.to,
        name: r.name,
        distanceKm: r.distanceKm,
        speedKmph: r.speedKmph,
        riskScore: r.riskScore,
        status: r.status,
        baseElevationM: r.baseElevationM,
        isOneWay: r.isOneWay,
        accessRestriction: r.accessRestriction,
        coordinates: r.coordinates
      }));
      const shortest = calculateDijkstraRoute(nodes, graphEdges, originId, destId, 'shortest', lambdaRisk, new Set(), new Set(), vehicleType);
      const fastest = calculateDijkstraRoute(nodes, graphEdges, originId, destId, 'fastest', lambdaRisk, new Set(), new Set(), vehicleType);
      const alternatives = calculateKShortestPaths(nodes, graphEdges, originId, destId, 'safest', lambdaRisk, 3, vehicleType);
      const safest =
        alternatives[0] ||
        calculateDijkstraRoute(nodes, graphEdges, originId, destId, 'safest', lambdaRisk, new Set(), new Set(), vehicleType);
      const bundle: MultiRouteResponse = {
        originNode: nodes[originId],
        targetNode: nodes[destId],
        lambdaRisk,
        shortest,
        fastest,
        safest,
        alternatives
      };
      setRouteBundle(bundle);
      setRouteError('Backend unreachable — computed using locally cached Pune road graph.');
      onRouteCalculated({
        ...bundle,
        activeMode: selectedRouteType,
        altIndex: selectedRouteType === 'safest' ? 0 : undefined
      });
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSelectMode = (mode: RouteMode, altIdx?: number) => {
    setSelectedRouteType(mode);
    const nextAltIdx = mode === 'safest' ? (altIdx ?? 0) : 0;
    setSelectedAltIdx(nextAltIdx);
    if (routeBundle) {
      onRouteCalculated({
        ...routeBundle,
        activeMode: mode,
        altIndex: mode === 'safest' ? nextAltIdx : undefined
      });
    }
  };

  const handleSwap = () => {
    setOriginId(destId);
    setDestId(originId);
  };

  const handleUseGpsOrigin = () => {
    if (!navigator.geolocation) {
      setGpsStatus('GPS is not supported on this browser.');
      return;
    }
    setGpsStatus('Detecting location...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/routes/snap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          });
          const data = await res.json();
          if (res.ok && data.nearestNode) {
            setOriginId(data.nearestNode.id);
            setGpsStatus(`Snapped to nearest node: ${data.nearestNode.name} (${data.distanceToNodeKm} km away)`);
          } else {
            setGpsStatus(data.error || 'Detected location is outside Pune/PCMC coverage.');
          }
        } catch {
          setGpsStatus('Unable to snap GPS coordinates.');
        }
      },
      (err) => {
        setGpsStatus(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Select an origin intersection manually.'
            : 'Could not obtain GPS position.'
        );
      },
      { timeout: 6000 }
    );
  };

  const activeRoute: RouteCalculationResult | null = routeBundle
    ? selectedRouteType === 'safest'
      ? routeBundle.alternatives[selectedAltIdx] || routeBundle.safest
      : selectedRouteType === 'fastest'
      ? routeBundle.fastest
      : routeBundle.shortest
    : null;

  const handleSpeakDirections = () => {
    if (!activeRoute) return;
    if (!activeRoute.feasible) {
      speakText('Warning: No feasible road path found due to flood closures.', lang);
      return;
    }
    const turns = activeRoute.edges
      .map(e => `${e.name}, ${e.distanceKm} kilometers, risk ${e.riskScore ?? 'unknown'}`)
      .join('. Then take ');
    const text = `Selected ${selectedRouteType} route from ${nodes[originId]?.name} to ${nodes[destId]?.name}. Distance ${activeRoute.totalDistanceKm} kilometers, estimated time ${activeRoute.travelTimeMins} minutes. ${turns}.`;
    speakText(text, lang);
  };

  const submitFeedbackAction = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitFeedback({
      routeName: activeRoute
        ? `${nodes[originId]?.name} to ${nodes[destId]?.name} (${selectedRouteType})`
        : 'Pune Safe Route',
      reachedSafely,
      routeCondition: feedbackNotes || (reachedSafely ? 'Passed without issue' : 'Encountered high water or detour'),
      waterLevelCategory: reachedSafely ? 'None / Shallow Puddles' : 'Deep Waterlogging',
      travelTimeMins: activeRoute ? activeRoute.travelTimeMins : 15,
      rating
    });
    setFeedbackSuccess(true);
    setTimeout(() => {
      setFeedbackSuccess(false);
      setShowFeedbackModal(false);
      setFeedbackNotes('');
    }, 1800);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-slate-100 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-blue-600/20 text-cyan-400 rounded-xl border border-cyan-500/30">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">{t.findSafeRoute}</h2>
            <p className="text-xs text-slate-400">Directed OSM graph routing (Shortest • Fastest • Safest)</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleUseGpsOrigin}
          className="text-[11px] bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 px-2.5 py-1.5 rounded-lg flex items-center space-x-1"
          title="Snap GPS location to nearest Pune road intersection"
        >
          <LocateFixed className="w-3.5 h-3.5" />
          <span>Use GPS</span>
        </button>
      </div>

      {gpsStatus && (
        <div className="text-[11px] bg-slate-800/80 border border-slate-700 text-cyan-300 px-3 py-1.5 rounded-lg">
          {gpsStatus}
        </div>
      )}

      {/* Place Search Quick Snap */}
      <div className="relative">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setSearchTarget(searchTarget || 'dest')}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!searchTarget) setSearchTarget('dest');
              }}
              placeholder="Search Pune/PCMC landmark (e.g. Swargate, Baner, Sassoon)..."
              aria-label="Search Pune or PCMC location"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
            />
          </div>
          <select
            aria-label="Apply search result to origin or destination"
            value={searchTarget || 'dest'}
            onChange={(e) => setSearchTarget(e.target.value as 'origin' | 'dest')}
            className="bg-slate-800 border border-slate-700 rounded-xl px-2 py-2 text-[11px] text-slate-300"
          >
            <option value="origin">Set Origin</option>
            <option value="dest">Set Dest</option>
          </select>
        </div>

        {(searchResults.length > 0 || isSearching) && searchQuery.trim().length >= 2 && (
          <div className="mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-40 overflow-y-auto divide-y divide-slate-700/60 text-xs">
            {isSearching && <div className="p-2 text-slate-400">Searching Pune/PCMC places...</div>}
            {searchResults.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (searchTarget === 'origin') setOriginId(item.nodeId);
                  else setDestId(item.nodeId);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-700/70 flex items-center justify-between"
              >
                <span className="text-slate-100 truncate pr-2">{item.label}</span>
                <span className="text-[10px] text-cyan-400 shrink-0">{item.source}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Origin & Destination Dropdowns + Swap */}
      <div className="grid grid-cols-1 gap-2.5">
        <div>
          <label htmlFor="route-origin" className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.origin}</span>
          </label>
          <select
            id="route-origin"
            value={originId}
            onChange={(e) => setOriginId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {nodeEntries.map(n => (
              <option key={n.id} value={n.id}>
                {n.name} ({n.elevationM ?? '?'}m)
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            <label htmlFor="route-dest" className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1">
              <MapPin className="w-3.5 h-3.5 text-red-400" />
              <span>{t.destination}</span>
            </label>
            <select
              id="route-dest"
              value={destId}
              onChange={(e) => setDestId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {nodeEntries.map(n => (
                <option key={n.id} value={n.id}>
                  {n.name} ({n.elevationM ?? '?'}m)
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleSwap}
            aria-label="Swap origin and destination"
            className="mt-5 p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-cyan-400"
            title="Swap Origin & Destination"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Risk Penalty Slider & Vehicle Mode */}
      <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/80 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="lambda-slider" className="font-semibold text-slate-300 flex items-center space-x-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {t.riskTolerance}: <strong className="text-cyan-300">{lambdaRisk.toFixed(1)}x</strong>
            </span>
          </label>
          <select
            aria-label="Vehicle type"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200"
          >
            <option value="car">Car / SUV</option>
            <option value="two_wheeler">Two-Wheeler</option>
            <option value="heavy">Heavy Vehicle</option>
            <option value="emergency">Emergency Vehicle</option>
          </select>
        </div>
        <input
          id="lambda-slider"
          type="range"
          min="0.2"
          max="4.0"
          step="0.2"
          value={lambdaRisk}
          onChange={(e) => setLambdaRisk(parseFloat(e.target.value))}
          className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
        />
      </div>

      <button
        type="button"
        onClick={handleCalculate}
        disabled={isCalculating}
        className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2 text-xs uppercase tracking-wider"
      >
        <RefreshCw className={`w-4 h-4 ${isCalculating ? 'animate-spin' : ''}`} />
        <span>{isCalculating ? 'Calculating Routes...' : t.findSafeRoute}</span>
      </button>

      {routeError && (
        <div className="text-[11px] bg-amber-950/50 border border-amber-700/60 text-amber-200 px-3 py-2 rounded-xl">
          {routeError}
        </div>
      )}

      {/* Results */}
      {routeBundle && activeRoute && (
        <div className="space-y-3.5 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{t.routeComparison}</h3>
            <button
              type="button"
              onClick={handleSpeakDirections}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 font-semibold"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{t.voiceSpeakRoute}</span>
            </button>
          </div>

          {/* 3 Mode Comparison Tabs */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            {(
              [
                { key: 'safest', label: t.calcSafest, data: routeBundle.safest, icon: ShieldCheck },
                { key: 'fastest', label: t.calcFastest, data: routeBundle.fastest, icon: Clock },
                { key: 'shortest', label: t.calcShortest, data: routeBundle.shortest, icon: RouteIcon }
              ] as const
            ).map(({ key, label, data, icon: Icon }) => {
              const isSelected = selectedRouteType === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectMode(key, key === 'safest' ? 0 : undefined)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-blue-950/70 border-cyan-500 ring-1 ring-cyan-500'
                      : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center space-x-1 font-bold text-[11px] text-cyan-300 mb-1">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{label}</span>
                  </div>
                  {data.feasible ? (
                    <div className="space-y-0.5 text-[11px]">
                      <div className="font-bold text-white">
                        {data.totalDistanceKm} km • {data.travelTimeMins}m
                      </div>
                      <div className="text-slate-400">
                        Risk: <strong className="text-slate-200">{data.averageRiskScore}</strong>
                        <span className="text-slate-500"> (Peak {data.maxRiskScore})</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {data.hazardousSegmentCount} haz • {data.closuresAvoidedCount} avoided
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-red-400 font-semibold">Blocked</div>
                  )}
                </button>
              );
            })}
          </div>

          {routeBundle.safest.feasible &&
            routeBundle.fastest.feasible &&
            routeBundle.shortest.feasible &&
            routeBundle.safest.edges.map(e => e.id).join(',') === routeBundle.fastest.edges.map(e => e.id).join(',') &&
            routeBundle.fastest.edges.map(e => e.id).join(',') === routeBundle.shortest.edges.map(e => e.id).join(',') && (
              <div className="text-[11px] bg-slate-800/70 border border-slate-700 text-slate-300 px-3 py-2 rounded-xl">
                Shortest, Fastest, and Safest independently converge on the same corridor here because it simultaneously minimizes distance, travel time, and C(e) = T(e) + λ·R_time(e).
              </div>
            )}

          {/* Safest Alternatives (Yen's K-Shortest Paths) */}
          {routeBundle.alternatives.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400">Alternatives:</span>
              {routeBundle.alternatives.map((alt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectMode('safest', idx)}
                  className={`px-2 py-1 rounded-lg border font-semibold ${
                    selectedRouteType === 'safest' && selectedAltIdx === idx
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  Option {idx + 1} ({alt.totalDistanceKm} km • {alt.travelTimeMins}m • Risk {alt.averageRiskScore})
                </button>
              ))}
            </div>
          )}

          {/* Selected Route Detail Metrics */}
          {activeRoute.feasible ? (
            <div className="bg-slate-800/70 rounded-xl p-3 border border-slate-700/80 space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                <div className="bg-slate-900/70 p-2 rounded-lg">
                  <span className="text-slate-400 block">Distance</span>
                  <strong className="text-white text-xs">{activeRoute.totalDistanceKm} km</strong>
                </div>
                <div className="bg-slate-900/70 p-2 rounded-lg">
                  <span className="text-slate-400 block">Est. Time</span>
                  <strong className="text-white text-xs">{activeRoute.travelTimeMins} mins</strong>
                </div>
                <div className="bg-slate-900/70 p-2 rounded-lg">
                  <span className="text-slate-400 block">Avg / Peak Risk</span>
                  <strong className="text-amber-300 text-xs">
                    {activeRoute.averageRiskScore} / {activeRoute.maxRiskScore}
                  </strong>
                </div>
                <div className="bg-slate-900/70 p-2 rounded-lg">
                  <span className="text-slate-400 block">Hazard Segs</span>
                  <strong className="text-orange-300 text-xs">{activeRoute.hazardousSegmentCount}</strong>
                </div>
                <div className="bg-slate-900/70 p-2 rounded-lg">
                  <span className="text-slate-400 block">Closures Avoided</span>
                  <strong className="text-cyan-300 text-xs">{activeRoute.closuresAvoidedCount}</strong>
                </div>
              </div>

              {activeRoute.unverifiedWarnings.length > 0 && (
                <div className="p-2 bg-amber-950/50 border border-amber-700/50 rounded-lg text-[11px] text-amber-200 space-y-0.5">
                  {activeRoute.unverifiedWarnings.map((w, i) => (
                    <div key={i} className="flex items-center space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                {activeRoute.edges.map((e, idx) => (
                  <div
                    key={`${e.id}-${idx}`}
                    className="flex items-center justify-between text-xs bg-slate-900/60 p-2 rounded-lg border border-slate-800"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                        {idx + 1}
                      </span>
                      <span className="truncate text-slate-200 font-medium">{e.name}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[11px] shrink-0 pl-2">
                      <span className="text-slate-400">{e.distanceKm} km</span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                          (e.riskScore ?? 50) >= 75
                            ? 'bg-red-500/20 text-red-400'
                            : (e.riskScore ?? 50) >= 50
                            ? 'bg-orange-500/20 text-orange-400'
                            : (e.riskScore ?? 50) >= 25
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        Risk {e.riskScore ?? 'Unknown'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-700 flex justify-between items-center">
                <span className="text-xs text-slate-400">{t.reachedSafelyQuestion}</span>
                <button
                  type="button"
                  onClick={() => setShowFeedbackModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{t.submitFeedback}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-red-950/40 border border-red-700/60 rounded-xl text-xs text-red-300 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{activeRoute.message || 'No feasible path found between selected intersections.'}</span>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 leading-relaxed">
        {t.safeNotice}
      </p>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <span>{t.submitFeedback}</span>
            </h3>

            {feedbackSuccess ? (
              <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-semibold text-center">
                Thank you! Your trip feedback has been persisted.
              </div>
            ) : (
              <form onSubmit={submitFeedbackAction} className="space-y-3 text-xs">
                <div>
                  <span className="block text-slate-300 font-semibold mb-1">Did you arrive safely?</span>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input type="radio" checked={reachedSafely} onChange={() => setReachedSafely(true)} />
                      <span className="text-slate-200">Yes, reached safely</span>
                    </label>
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input type="radio" checked={!reachedSafely} onChange={() => setReachedSafely(false)} />
                      <span className="text-slate-200">Encountered waterlogging</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label htmlFor="fb-notes" className="block text-slate-300 font-semibold mb-1">
                    Observed Road Condition
                  </label>
                  <textarea
                    id="fb-notes"
                    rows={2}
                    value={feedbackNotes}
                    onChange={(e) => setFeedbackNotes(e.target.value)}
                    placeholder="E.g. Minor puddle near Nal Stop, passable"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
                  />
                </div>

                <div>
                  <label htmlFor="fb-rating" className="block text-slate-300 font-semibold mb-1">
                    Route Safety Rating (1-5)
                  </label>
                  <select
                    id="fb-rating"
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
                  >
                    <option value={5}>5 - Clear &amp; Safe</option>
                    <option value={4}>4 - Good, minor puddles</option>
                    <option value={3}>3 - Moderate water, proceed cautiously</option>
                    <option value={2}>2 - High water, avoid small cars</option>
                    <option value={1}>1 - Dangerous / impassable</option>
                  </select>
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowFeedbackModal(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl"
                  >
                    Submit Feedback
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
