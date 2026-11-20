import React, { useState, useEffect, useRef } from 'react';
import { RoadNode, RoadSegment, RouteFeedback, Language, CommunityReport } from '../types';
import {
  calculateDijkstraRoute,
  calculateKShortestPaths,
  ActiveRouteSelection,
  createRouteSelection,
  getRoadRiskLevel,
  getRouteRiskCounts,
  MultiRouteResponse,
  RouteMode,
  SelectedRoute
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
  Route as RouteIcon,
  Pause,
  Play,
  Square,
  ExternalLink,
  Crosshair
} from 'lucide-react';

interface SafeRoutePlannerProps {
  nodes: Record<string, RoadNode>;
  roads: RoadSegment[];
  lang: Language;
  externalOriginId?: string;
  externalDestId?: string;
  voiceRouteRequest?: {
    id: number;
    startNodeId: string;
    targetNodeId: string;
    mode: RouteMode;
  } | null;
  voiceRouteSelectionRequest?: {
    id: number;
    mode: RouteMode;
    alternativeIndex?: number;
  } | null;
  activeRouteBundle?: ActiveRouteSelection | null;
  onRouteCalculated: (result: ActiveRouteSelection | null) => void;
  selectedRoute?: SelectedRoute | null;
  onSubmitFeedback: (feedback: Partial<RouteFeedback>) => void;
  onGpsFix?: (fix: GpsFix | null) => void;
  reports?: CommunityReport[];
  onRecenterMap?: () => void;
  onGpsTrackingChange?: (tracking: boolean) => void;
}

interface GeocodeItem {
  label: string;
  sector: string;
  lat: number;
  lng: number;
  nodeId: string;
  source: string;
}

type GpsStatus = 'GPS Off' | 'Acquiring GPS' | 'GPS Active' | 'Weak GPS Signal' | 'Permission Denied' | 'GPS Unavailable';

interface GpsFix {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  timestamp: number;
}

export const SafeRoutePlanner: React.FC<SafeRoutePlannerProps> = ({
  nodes,
  roads,
  lang,
  externalOriginId,
  externalDestId,
  voiceRouteRequest,
  voiceRouteSelectionRequest,
  activeRouteBundle,
  onRouteCalculated,
  selectedRoute: externalSelectedRoute,
  onSubmitFeedback,
  onGpsFix,
  reports = [],
  onRecenterMap,
  onGpsTrackingChange
}) => {
  const t = TRANSLATIONS[lang];
  const nodeEntries = Object.values(nodes);

  const [originId, setOriginId] = useState<string>(externalOriginId || 'N_KOTHRUD');
  const [destId, setDestId] = useState<string>(externalDestId || 'N_AUNDH');
  const [lambdaRisk, setLambdaRisk] = useState<number>(1.8);
  const [vehicleType, setVehicleType] = useState<'car' | 'two_wheeler' | 'heavy' | 'emergency'>('car');

  // Searchable geocode states
  const [searchTarget, setSearchTarget] = useState<'origin' | 'dest' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [routeBundle, setRouteBundle] = useState<MultiRouteResponse | null>(null);
  const routeBundleRef = useRef(routeBundle);
  routeBundleRef.current = routeBundle;
  const roadDataSignatureRef = useRef('');
  const routeRefreshRequestRef = useRef(0);
  const lastVoiceRouteRequestRef = useRef<number | null>(null);
  const lastVoiceRouteSelectionRequestRef = useRef<number | null>(null);
  const [selectedRouteType, setSelectedRouteType] = useState<RouteMode>('safest');
  const [selectedAltIdx, setSelectedAltIdx] = useState<number>(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [gpsFix, setGpsFix] = useState<GpsFix | null>(null);
  const [gpsHealth, setGpsHealth] = useState<GpsStatus>('GPS Off');
  const [navigationStatus, setNavigationStatus] = useState<'idle' | 'navigating' | 'paused' | 'stopped'>('idle');
  const [navigationNotice, setNavigationNotice] = useState<string | null>(null);
  const gpsWatchRef = useRef<number | null>(null);
  const offRouteCountRef = useRef(0);
  const rerouteCooldownRef = useRef(0);
  const navigationStatusRef = useRef<'idle' | 'navigating' | 'paused' | 'stopped'>('idle');
  const activeRouteRef = useRef<SelectedRoute | null>(null);

  // Route feedback modal state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [reachedSafely, setReachedSafely] = useState(true);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [rating, setRating] = useState(5);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  const invalidateCalculatedRoute = () => {
    routeRefreshRequestRef.current += 1;
    if (navigationStatusRef.current === 'navigating' || navigationStatusRef.current === 'paused') {
      stopGpsWatch();
      navigationStatusRef.current = 'stopped';
      setNavigationStatus('stopped');
      onGpsTrackingChange?.(false);
      setGpsFix(null);
      onGpsFix?.(null);
      setGpsHealth('GPS Off');
      setNavigationNotice('Route inputs changed. Navigation stopped; calculate the updated route before restarting.');
    }
    setRouteBundle(null);
    onRouteCalculated(null);
  };

  useEffect(() => {
    if (externalOriginId && nodes[externalOriginId] && originId !== externalOriginId) {
      setOriginId(externalOriginId);
      invalidateCalculatedRoute();
    }
  }, [externalOriginId, nodes]);

  useEffect(() => {
    if (externalDestId && nodes[externalDestId] && destId !== externalDestId) {
      setDestId(externalDestId);
      invalidateCalculatedRoute();
    }
  }, [externalDestId, nodes]);

  // Dynamically recalculate safest route when risk-avoidance slider changes (preserving shortest & fastest unchanged)
  useEffect(() => {
    if (!routeBundle) return;
    const requestId = ++routeRefreshRequestRef.current;
    const timer = setTimeout(async () => {
      const currentBundle = routeBundleRef.current;
      if (!currentBundle) return;
      const currentOriginId = currentBundle.originNode.id;
      const currentTargetId = currentBundle.targetNode.id;
      try {
        const res = await fetch('/api/routes/find', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startNodeId: currentOriginId,
            targetNodeId: currentTargetId,
            lambdaRisk,
            vehicleType
          })
        });
        if (!res.ok) {
          throw new Error(`Route refresh failed with HTTP ${res.status}`);
        }
        const data: MultiRouteResponse = await res.json();
        if (requestId !== routeRefreshRequestRef.current || !routeBundleRef.current) return;
        setRouteError(null);
        const updated = {
          ...data,
          lambdaRisk
        };
        setRouteBundle(updated);
        onRouteCalculated(createRouteSelection(updated, selectedRouteType, selectedAltIdx));
      } catch (error) {
        if (requestId !== routeRefreshRequestRef.current || !routeBundleRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[FloodGuard] Backend route refresh failed; using loaded road data:', message);
        setRouteError(`Backend route refresh failed (${message}) — route recalculated from the loaded road graph. Weather, traffic, and newly verified closures could not be checked.`);
        const graphEdges = roads.map(r => ({ ...r }));
        const alternatives = calculateKShortestPaths(
          nodes,
          graphEdges,
          currentOriginId,
          currentTargetId,
          'safest',
          lambdaRisk,
          3,
          vehicleType
        );
        const safest =
          alternatives[0] ||
          calculateDijkstraRoute(nodes, graphEdges, currentOriginId, currentTargetId, 'safest', lambdaRisk, new Set(), new Set(), vehicleType);
        const shortest = calculateDijkstraRoute(
          nodes,
          graphEdges,
          currentOriginId,
          currentTargetId,
          'shortest',
          lambdaRisk,
          new Set(),
          new Set(),
          vehicleType
        );
        const fastest = calculateDijkstraRoute(
          nodes,
          graphEdges,
          currentOriginId,
          currentTargetId,
          'fastest',
          lambdaRisk,
          new Set(),
          new Set(),
          vehicleType
        );
        const updated = {
          ...routeBundleRef.current,
          lambdaRisk,
          shortest,
          fastest,
          safest,
          alternatives,
          dataQuality: undefined
        };
        setRouteBundle(updated);
        onRouteCalculated(createRouteSelection(updated, selectedRouteType, selectedAltIdx));
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [lambdaRisk, roads, vehicleType]);

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

  useEffect(() => {
    return () => {
      if (gpsWatchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
        onGpsTrackingChange?.(false);
      }
      onGpsFix?.(null);
    };
  }, []);

  useEffect(() => {
    if (!gpsFix) return;
    const remainingFreshMs = 15_000 - (Date.now() - gpsFix.timestamp);
    if (remainingFreshMs <= 0) {
      setGpsHealth('GPS Unavailable');
      setGpsFix(null);
      onGpsFix?.(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      setGpsHealth('GPS Unavailable');
      setGpsFix(null);
      onGpsFix?.(null);
    }, remainingFreshMs);
    return () => window.clearTimeout(timeout);
  }, [gpsFix, onGpsFix]);

  const stopGpsWatch = () => {
    if (gpsWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
  };

  const pointToSegmentDistanceMetres = (
    lat: number,
    lng: number,
    segment: { coordinates?: [number, number][] }
  ): number => {
    const coords = segment.coordinates || [];
    if (coords.length === 0) return Number.POSITIVE_INFINITY;

    let nearest = Number.POSITIVE_INFINITY;
    const haversineMetres = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const earthRadius = 6371000;
      const dLat = (bLat - aLat) * Math.PI / 180;
      const dLng = (bLng - aLng) * Math.PI / 180;
      const lat1 = aLat * Math.PI / 180;
      const lat2 = bLat * Math.PI / 180;
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
    };

    for (const [segLat, segLng] of coords) {
      nearest = Math.min(nearest, haversineMetres(lat, lng, segLat, segLng));
    }
    return nearest;
  };

  const startGpsWatch = () => {
    if (!navigator.geolocation) {
      setGpsHealth('GPS Unavailable');
      return;
    }
    if (gpsWatchRef.current !== null) return;

    setGpsHealth('Acquiring GPS');
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const fix: GpsFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: typeof pos.coords.heading === 'number' ? pos.coords.heading : null,
          timestamp: pos.timestamp
        };
        setGpsFix(fix);
        onGpsFix?.(fix);
        setGpsHealth(pos.coords.accuracy <= 50 ? 'GPS Active' : 'Weak GPS Signal');

        if (navigationStatusRef.current === 'navigating' && routeBundle) {
          const selected = activeRouteRef.current;
          if (!selected?.feasible) return;
          if (fix.accuracy > 50) return;

          const distances = selected.edges.map(edge =>
            pointToSegmentDistanceMetres(fix.lat, fix.lng, edge)
          );
          const offRouteDistance = Math.min(...distances);
          if (offRouteDistance > 75) {
            offRouteCountRef.current += 1;
          } else {
            offRouteCountRef.current = 0;
          }

          const now = Date.now();
          if (
            offRouteCountRef.current >= 3 &&
            now - rerouteCooldownRef.current > 30_000 &&
            routeBundle.targetNode
          ) {
            rerouteCooldownRef.current = now;
            offRouteCountRef.current = 0;
            setNavigationNotice('Route deviation detected. Checking for a safer alternative...');
            try {
              const response = await fetch('/api/routes/find', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  originLat: fix.lat,
                  originLng: fix.lng,
                  targetNodeId: routeBundle.targetNode.id,
                  lambdaRisk,
                  vehicleType
                })
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error || 'Rerouting failed.');
              setRouteBundle(data);
              setNavigationNotice('New safe route available.');
              onRouteCalculated(createRouteSelection(data, selectedRouteType));
            } catch (error) {
              setNavigationNotice(
                error instanceof Error
                  ? `Rerouting failed: ${error.message}. Existing route preserved.`
                  : 'Rerouting failed. Existing route preserved.'
              );
            }
          }
        }
      },
      (err) => {
        setGpsFix(null);
        onGpsFix?.(null);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsHealth('Permission Denied');
          stopGpsWatch();
          navigationStatusRef.current = 'paused';
          setNavigationStatus('paused');
          onGpsTrackingChange?.(false);
        } else if (err.code === err.TIMEOUT) {
          setGpsHealth('GPS Unavailable');
        } else {
          setGpsHealth('GPS Unavailable');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  };

  const handleCalculate = async (
    requestedMode: RouteMode = selectedRouteType,
    requestedOriginId: string = originId,
    requestedDestId: string = destId
  ) => {
    setIsCalculating(true);
    setRouteError(null);
    setSelectedAltIdx(0);
    setSelectedRouteType(requestedMode);
    setOriginId(requestedOriginId);
    setDestId(requestedDestId);

    try {
      const res = await fetch('/api/routes/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startNodeId: requestedOriginId,
          targetNodeId: requestedDestId,
          lambdaRisk,
          vehicleType
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to compute route.');
      const bundle: MultiRouteResponse = data;
      setRouteBundle(bundle);
      onRouteCalculated(createRouteSelection(bundle, requestedMode, 0));
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
      const shortest = calculateDijkstraRoute(nodes, graphEdges, requestedOriginId, requestedDestId, 'shortest', lambdaRisk, new Set(), new Set(), vehicleType);
      const fastest = calculateDijkstraRoute(nodes, graphEdges, requestedOriginId, requestedDestId, 'fastest', lambdaRisk, new Set(), new Set(), vehicleType);
      const alternatives = calculateKShortestPaths(nodes, graphEdges, requestedOriginId, requestedDestId, 'safest', lambdaRisk, 3, vehicleType);
      const safest =
        alternatives[0] ||
        calculateDijkstraRoute(nodes, graphEdges, requestedOriginId, requestedDestId, 'safest', lambdaRisk, new Set(), new Set(), vehicleType);
      const bundle: MultiRouteResponse = {
        originNode: nodes[requestedOriginId],
        targetNode: nodes[requestedDestId],
        lambdaRisk,
        shortest,
        fastest,
        safest,
        alternatives
      };
      setRouteBundle(bundle);
      setRouteError('Backend unavailable — route calculated locally from the currently loaded Pune road graph. Weather, traffic, and new closures may be stale; estimated risk is not a safety guarantee.');
      onRouteCalculated(createRouteSelection(bundle, requestedMode, 0));
    } finally {
      setIsCalculating(false);
    }
  };

  useEffect(() => {
    const signature = roads
      .map(road => [
        road.id,
        road.status,
        road.riskScore ?? 'unknown',
        road.speedKmph,
        road.distanceKm,
        road.isOneWay,
        road.accessRestriction ?? '',
        JSON.stringify(road.coordinates)
      ].join(':'))
      .sort()
      .join('|');

    if (signature === roadDataSignatureRef.current) return;
    const hadPreviousRoadData = Boolean(roadDataSignatureRef.current);
    roadDataSignatureRef.current = signature;
    const currentBundle = routeBundleRef.current;
    if (!hadPreviousRoadData || !currentBundle) return;

    void handleCalculate(
      selectedRouteType,
      currentBundle.originNode.id,
      currentBundle.targetNode.id
    );
  }, [roads]);

  useEffect(() => {
    if (!voiceRouteRequest || lastVoiceRouteRequestRef.current === voiceRouteRequest.id) return;
    if (!nodes[voiceRouteRequest.startNodeId] || !nodes[voiceRouteRequest.targetNodeId]) return;
    lastVoiceRouteRequestRef.current = voiceRouteRequest.id;
    invalidateCalculatedRoute();
    void handleCalculate(
      voiceRouteRequest.mode,
      voiceRouteRequest.startNodeId,
      voiceRouteRequest.targetNodeId
    );
  }, [voiceRouteRequest, nodes]);

  const handleSelectMode = (mode: RouteMode, altIdx?: number) => {
    setSelectedRouteType(mode);
    const nextAltIdx = mode === 'safest' ? (altIdx ?? 0) : 0;
    setSelectedAltIdx(nextAltIdx);
    if (routeBundle) {
      onRouteCalculated(createRouteSelection(routeBundle, mode, nextAltIdx));
    }
  };

  useEffect(() => {
    if (
      !voiceRouteSelectionRequest ||
      lastVoiceRouteSelectionRequestRef.current === voiceRouteSelectionRequest.id
    ) return;
    const bundle = routeBundleRef.current || activeRouteBundle;
    if (!bundle) return;
    lastVoiceRouteSelectionRequestRef.current = voiceRouteSelectionRequest.id;
    const alternativeIndex = voiceRouteSelectionRequest.mode === 'safest'
      ? voiceRouteSelectionRequest.alternativeIndex ?? 0
      : 0;
    setRouteBundle(bundle);
    setSelectedRouteType(voiceRouteSelectionRequest.mode);
    setSelectedAltIdx(alternativeIndex);
    onRouteCalculated(createRouteSelection(bundle, voiceRouteSelectionRequest.mode, alternativeIndex));
  }, [activeRouteBundle, voiceRouteSelectionRequest]);

  const handleSwap = () => {
    setOriginId(destId);
    setDestId(originId);
    invalidateCalculatedRoute();
  };

  const handleUseGpsOrigin = () => {
    if (!navigator.geolocation) {
      setGpsHealth('GPS Unavailable');
      return;
    }
    setGpsFix(null);
    onGpsFix?.(null);
    setGpsHealth('Acquiring GPS');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const fix: GpsFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: typeof position.coords.heading === 'number' ? position.coords.heading : null,
          timestamp: position.timestamp
        };
        setGpsFix(fix);
        onGpsFix?.(fix);
        setGpsHealth(fix.accuracy <= 50 ? 'GPS Active' : 'Weak GPS Signal');
        try {
          const response = await fetch('/api/routes/snap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: fix.lat, lng: fix.lng })
          });
          const data = await response.json();
          if (!response.ok || !data.nearestNode) {
            throw new Error(data.error || 'Could not match your location to a road.');
          }
          setOriginId(data.nearestNode.id);
          invalidateCalculatedRoute();
        } catch (error) {
          setGpsHealth('GPS Unavailable');
          setGpsFix(null);
          onGpsFix?.(null);
          setNavigationNotice(
            error instanceof Error ? error.message : 'Could not use the current GPS location as origin.'
          );
        }
      },
      (error) => {
        setGpsHealth(
          error.code === error.PERMISSION_DENIED
            ? 'Permission Denied'
            : 'GPS Unavailable'
        );
        setGpsFix(null);
        onGpsFix?.(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const activeRoute: SelectedRoute | null =
    externalSelectedRoute !== undefined
      ? externalSelectedRoute
      : routeBundle
      ? createRouteSelection(routeBundle, selectedRouteType, selectedAltIdx).selectedRoute
      : null;
  activeRouteRef.current = activeRoute;

  const routeConvergenceGroups = routeBundle
    ? (() => {
        const groups = new Map<string, string[]>();
        for (const [label, route] of [
          ['Safest', routeBundle.safest],
          ['Fastest', routeBundle.fastest],
          ['Shortest', routeBundle.shortest]
        ] as const) {
          if (!route.feasible) continue;
          const edgeIds = route.edges.map(edge => edge.id);
          const key = edgeIds.join(',');
          if (key) groups.set(key, [...(groups.get(key) || []), label]);
        }
        return [...groups.entries()]
          .filter(([, labels]) => labels.length > 1)
          .map(([edgeIds, labels]) => ({ edgeIds: edgeIds.split(','), labels }));
      })()
    : [];
  const distinctRoutePathCount = routeBundle
    ? new Set(
        [
          ...routeBundle.alternatives,
          routeBundle.safest,
          routeBundle.fastest,
          routeBundle.shortest
        ]
          .filter(route => route.feasible)
          .map(route => route.edges.map(edge => edge.id).join(','))
      ).size
    : 0;

  const handleStartNavigation = () => {
    if (!activeRoute?.feasible) {
      setNavigationNotice('Select a feasible route before starting navigation.');
      return;
    }
    navigationStatusRef.current = 'navigating';
    setNavigationStatus('navigating');
    setGpsFix(null);
    onGpsFix?.(null);
    setGpsHealth('Acquiring GPS');
    onGpsTrackingChange?.(true);
    onRecenterMap?.();
    setNavigationNotice('Navigation started - using your device GPS location.');
    startGpsWatch();
  };

  const handlePauseNavigation = () => {
    navigationStatusRef.current = 'paused';
    setNavigationStatus('paused');
    onGpsTrackingChange?.(false);
    stopGpsWatch();
    setGpsFix(null);
    onGpsFix?.(null);
    setGpsHealth('GPS Off');
    setNavigationNotice('Navigation paused.');
  };

  const handleResumeNavigation = () => {
    navigationStatusRef.current = 'navigating';
    setNavigationStatus('navigating');
    onGpsTrackingChange?.(true);
    onRecenterMap?.();
    setNavigationNotice('Navigation resumed.');
    startGpsWatch();
  };

  const handleStopNavigation = () => {
    navigationStatusRef.current = 'stopped';
    setNavigationStatus('stopped');
    onGpsTrackingChange?.(false);
    stopGpsWatch();
    setGpsFix(null);
    onGpsFix?.(null);
    setGpsHealth('GPS Off');
    setNavigationNotice('Navigation stopped. Live GPS tracking has stopped.');
  };

  const openInGoogleMaps = () => {
    if (!routeBundle?.targetNode) return;
    const origin = gpsFix
      ? { lat: gpsFix.lat, lng: gpsFix.lng }
      : { lat: routeBundle.originNode.lat, lng: routeBundle.originNode.lng };
    const destination = { lat: routeBundle.targetNode.lat, lng: routeBundle.targetNode.lng };
    const waypoints = (activeRoute?.edges || [])
      .slice(0, 8)
      .map(edge => {
        const coordinate = edge.coordinates?.[Math.floor(edge.coordinates.length / 2)];
        return coordinate ? `${coordinate[0]},${coordinate[1]}` : null;
      })
      .filter((point): point is string => Boolean(point));
    const params = new URLSearchParams({
      api: '1',
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      travelmode: 'driving'
    });
    if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'));
    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  let navigationRemainingDistanceKm: number | null = null;
  let navigationRemainingTimeMins: number | null = null;
  let currentRoadSegment: string | null = null;
  let nextRoadSegment: string | null = null;
  let currentRoadRisk: number | null = null;
  let currentRouteEdgeIndex: number | null = null;
  if (gpsFix && activeRoute?.feasible) {
    let nearestEdgeIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    activeRoute.edges.forEach((edge, index) => {
      const distance = pointToSegmentDistanceMetres(gpsFix.lat, gpsFix.lng, edge);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestEdgeIndex = index;
      }
    });
    const remainingEdges = activeRoute.edges.slice(nearestEdgeIndex);
    currentRouteEdgeIndex = nearestEdgeIndex;
    currentRoadSegment = remainingEdges[0]?.name || null;
    nextRoadSegment = remainingEdges[1]?.name || null;
    currentRoadRisk = remainingEdges[0]?.riskScore ?? null;
    navigationRemainingDistanceKm = Math.round(
      remainingEdges.reduce((sum, edge) => sum + edge.distanceKm, 0) * 100
    ) / 100;
    if (activeRoute.totalDistanceKm > 0) {
      navigationRemainingTimeMins = Math.round(
        activeRoute.travelTimeMins * (navigationRemainingDistanceKm / activeRoute.totalDistanceKm) * 10
      ) / 10;
    }
  }

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

  const hasFreshGpsFix = Boolean(
    gpsFix &&
    Number.isFinite(gpsFix.lat) &&
    Number.isFinite(gpsFix.lng) &&
    Number.isFinite(gpsFix.accuracy) &&
    gpsFix.accuracy >= 0 &&
    Date.now() - gpsFix.timestamp < 15_000
  );
  const visibleGpsHealth: GpsStatus =
    (gpsHealth === 'GPS Active' || gpsHealth === 'Weak GPS Signal') && !hasFreshGpsFix
      ? 'GPS Unavailable'
      : gpsHealth;
  const gpsStateStyle = {
    'GPS Off': { dot: 'bg-slate-500', text: 'GPS is off.', border: 'border-slate-700', tone: 'text-slate-300' },
    'Acquiring GPS': { dot: 'bg-blue-400 animate-pulse', text: 'Acquiring your location...', border: 'border-blue-500/40', tone: 'text-blue-200' },
    'GPS Active': { dot: 'bg-emerald-400', text: 'GPS signal active.', border: 'border-emerald-500/40', tone: 'text-emerald-200' },
    'Weak GPS Signal': { dot: 'bg-orange-400', text: 'GPS accuracy is weak.', border: 'border-orange-500/40', tone: 'text-orange-200' },
    'Permission Denied': { dot: 'bg-red-400', text: 'Location permission denied.', border: 'border-red-500/40', tone: 'text-red-200' },
    'GPS Unavailable': { dot: 'bg-orange-400', text: 'GPS location unavailable.', border: 'border-orange-500/40', tone: 'text-orange-200' }
  }[visibleGpsHealth];

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
      </div>

      <section className={`rounded-xl border ${gpsStateStyle.border} bg-slate-800/80 px-3.5 py-3`} aria-live="polite">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${gpsStateStyle.dot}`} />
            <div>
              <p className={`text-xs font-bold ${gpsStateStyle.tone}`}>{gpsStateStyle.text}</p>
              {hasFreshGpsFix && gpsFix && (
                <p className="mt-1 text-[10px] text-slate-300">
                  Accuracy {Math.round(gpsFix.accuracy)} m · Updated {new Date(gpsFix.timestamp).toLocaleTimeString()}
                </p>
              )}
              {visibleGpsHealth === 'Weak GPS Signal' && (
                <p className="mt-1 text-[10px] text-orange-200/80">Route progress may be inaccurate at this accuracy.</p>
              )}
              {visibleGpsHealth === 'Permission Denied' && (
                <p className="mt-1 text-[10px] text-red-200/80">Allow location access in your browser or device settings, then try again.</p>
              )}
              {navigationStatus === 'navigating' && hasFreshGpsFix && (
                <p className="mt-1 text-[10px] font-bold text-emerald-300">LIVE TRACKING</p>
              )}
              {navigationStatus === 'paused' && (
                <p className="mt-1 text-[10px] font-bold text-amber-300">NAVIGATION PAUSED</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleUseGpsOrigin}
            disabled={navigationStatus === 'navigating'}
            className="min-h-10 shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            title={navigationStatus === 'navigating' ? 'Stop navigation before changing the route origin' : 'Get a one-time GPS fix and use it as the route origin'}
          >
            <LocateFixed className="mr-1 inline h-3.5 w-3.5" />
            {visibleGpsHealth === 'GPS Off' || visibleGpsHealth === 'GPS Unavailable' ? 'Enable GPS' : 'Use GPS as origin'}
          </button>
        </div>
      </section>

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
                  if (searchTarget === 'origin' && item.nodeId !== originId) {
                    setOriginId(item.nodeId);
                    invalidateCalculatedRoute();
                  } else if (searchTarget === 'dest' && item.nodeId !== destId) {
                    setDestId(item.nodeId);
                    invalidateCalculatedRoute();
                  }
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
            onChange={(e) => {
              setOriginId(e.target.value);
              invalidateCalculatedRoute();
            }}
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
              onChange={(e) => {
                setDestId(e.target.value);
                invalidateCalculatedRoute();
              }}
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
            onChange={(e) => {
              setVehicleType(e.target.value as 'car' | 'two_wheeler' | 'heavy' | 'emergency');
              invalidateCalculatedRoute();
            }}
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
        onClick={() => void handleCalculate()}
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

      {routeBundle?.dataQuality?.warnings.length ? (
        <div className="text-[11px] bg-amber-950/40 border border-amber-700/50 text-amber-200 px-3 py-2 rounded-xl space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Live data limitations</span>
          </div>
          <ul className="list-disc pl-5 text-amber-100/90">
            {routeBundle.dataQuality.warnings.map(warning => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {routeBundle && activeRoute?.feasible && (
        <div className="space-y-3 pt-2">
          {!activeRoute.geometryAvailable && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-200" role="status">
              Road geometry is unavailable for one or more route segments. Route details remain available, but the map will not draw an incomplete path.
            </div>
          )}
          <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-br from-slate-800 to-blue-950/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-400 font-bold">Selected route summary</p>
                <h3 className="mt-1 text-lg font-bold text-white capitalize">{selectedRouteType} route</h3>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                activeRoute.safetyRating === 'Low Risk'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : activeRoute.safetyRating === 'Moderate Risk'
                  ? 'bg-yellow-500/20 text-yellow-300'
                  : activeRoute.safetyRating === 'High Risk'
                  ? 'bg-orange-500/20 text-orange-300'
                  : activeRoute.safetyRating === 'Severe Risk'
                  ? 'bg-red-500/20 text-red-300'
                  : activeRoute.safetyRating === 'Unknown'
                  ? 'bg-slate-500/20 text-slate-300'
                  : 'bg-red-500/20 text-red-300'
              }`}>
                {activeRoute.safetyRating}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-950/50 p-2">
                <span className="block text-slate-400">Distance</span>
                <strong className="text-white">{activeRoute.totalDistanceKm} km</strong>
              </div>
              <div className="rounded-lg bg-slate-950/50 p-2">
                <span className="block text-slate-400">Estimated time</span>
                <strong className="text-white">{activeRoute.travelTimeMins} min</strong>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-300 space-y-1">
              <p><span className="text-slate-500">From:</span> {nodes[originId]?.name || routeBundle.originNode.name}</p>
              <p><span className="text-slate-500">To:</span> {nodes[destId]?.name || routeBundle.targetNode.name}</p>
              <p className="leading-relaxed text-slate-400">
                This route is ranked using the available road risk values, distance, closures and travel estimates.
                {' '}{activeRoute.unknownRiskSegmentsCount > 0
                  ? `Risk information is unavailable for ${activeRoute.unknownRiskSegmentsCount} segment(s); this route cannot be confirmed safe.`
                  : activeRoute.unverifiedWarnings.length > 0
                  ? 'It includes one or more unverified or verified road warnings - review the timeline before travel.'
                  : 'No route-specific warning is available from the current road data.'}
              </p>
            </div>
          </div>

          {routeBundle.dataQuality && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-2.5 text-[10px]">
                <div className="font-bold text-sky-300">Weather / rainfall</div>
                <div className="mt-1 text-slate-300">
                  {routeBundle.dataQuality.weather.status === 'OK' ? 'Active' : 'Unavailable'}
                  {routeBundle.dataQuality.weather.lastSuccessfulUpdate
                    ? ` · ${new Date(routeBundle.dataQuality.weather.lastSuccessfulUpdate).toLocaleString()}`
                    : ''}
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-2.5 text-[10px]">
                <div className="font-bold text-cyan-300">Traffic</div>
                <div className="mt-1 text-slate-300">
                  {routeBundle.dataQuality.traffic.liveSegments > 0 ? 'Active' : 'Estimated'}
                  {' · '}{routeBundle.dataQuality.traffic.liveSegments}/{routeBundle.dataQuality.traffic.sampledSegments} live segments
                </div>
              </div>
            </div>
          )}
          <p className="text-[9px] leading-relaxed text-slate-500">
            OpenStreetMap provides road geometry. Flood risk is an estimate from available rainfall, road attributes, historical flags and reports; traffic speeds affect travel-time estimates, not the flood-risk score.
          </p>

          <div className={`rounded-2xl border p-3 ${
            navigationStatus === 'navigating'
              ? 'border-emerald-500/60 bg-emerald-950/30'
              : navigationStatus === 'paused'
              ? 'border-amber-500/50 bg-amber-950/20'
              : 'border-slate-700 bg-slate-800/60'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white">
                  {navigationStatus === 'navigating' ? 'LIVE NAVIGATION' : 'Navigation'}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {navigationStatus === 'navigating' && hasFreshGpsFix
                    ? `GPS signal active · ${Math.round(gpsFix?.accuracy || 0)} m accuracy`
                    : `GPS: ${visibleGpsHealth}`}
                </p>
              </div>
              {navigationStatus === 'navigating' && hasFreshGpsFix && (
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[9px] font-extrabold tracking-wider text-emerald-300">
                  ● LIVE TRACKING
                </span>
              )}
              {navigationStatus === 'paused' && (
                <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-[9px] font-extrabold tracking-wider text-amber-300">
                  NAVIGATION PAUSED
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-lg bg-slate-950/50 p-2">
                <span className="block text-slate-500">Starting location</span>
                <strong className="text-slate-200">{routeBundle.originNode.name}</strong>
              </div>
              <div className="rounded-lg bg-slate-950/50 p-2">
                <span className="block text-slate-500">Destination</span>
                <strong className="text-slate-200">{routeBundle.targetNode.name}</strong>
              </div>
            </div>
            {gpsFix && (
              <p className="mt-2 text-[10px] text-slate-400">
                {gpsFix.lat.toFixed(5)}, {gpsFix.lng.toFixed(5)} · updated {new Date(gpsFix.timestamp).toLocaleTimeString()}
              </p>
            )}
            {navigationStatus !== 'idle' && gpsFix && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg bg-slate-950/50 p-2">
                  <span className="block text-slate-500">Current road</span>
                  <strong className="text-slate-200">{currentRoadSegment || 'Road unavailable'}</strong>
                </div>
                <div className="rounded-lg bg-slate-950/50 p-2">
                  <span className="block text-slate-500">Next road</span>
                  <strong className="text-slate-200">{nextRoadSegment || 'Destination'}</strong>
                </div>
              </div>
            )}
            {navigationStatus === 'navigating' && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                <span className="text-slate-300">
                  Remaining {navigationRemainingDistanceKm === null ? '—' : `${navigationRemainingDistanceKm} km`}
                  {navigationRemainingTimeMins !== null ? ` · ${navigationRemainingTimeMins} min est.` : ''}
                </span>
                <span className="text-slate-300">
                  Current route risk: {currentRoadRisk === null ? 'Unavailable' : `${currentRoadRisk}/100 (estimated)`}
                </span>
              </div>
            )}
            {navigationNotice && (
              <p className="mt-2 rounded-lg bg-slate-950/60 px-2 py-1.5 text-[10px] text-cyan-200">
                {navigationNotice}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {navigationStatus === 'idle' || navigationStatus === 'stopped' ? (
                <button type="button" onClick={handleStartNavigation} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white">
                  <Navigation className="mr-1 inline h-3.5 w-3.5" />Start navigation
                </button>
              ) : navigationStatus === 'navigating' ? (
                <button type="button" onClick={handlePauseNavigation} className="rounded-lg bg-amber-600 px-3 py-2 text-[11px] font-bold text-white">
                  <Pause className="mr-1 inline h-3.5 w-3.5" />Pause
                </button>
              ) : (
                <button type="button" onClick={handleResumeNavigation} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white">
                  <Play className="mr-1 inline h-3.5 w-3.5" />Resume
                </button>
              )}
              {(navigationStatus === 'navigating' || navigationStatus === 'paused') && (
                <button type="button" onClick={handleStopNavigation} className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-300">
                  <Square className="mr-1 inline h-3.5 w-3.5" />Stop
                </button>
              )}
              <button type="button" onClick={openInGoogleMaps} className="rounded-lg border border-blue-400/40 bg-blue-500/10 px-3 py-2 text-[11px] font-bold text-blue-300">
                <ExternalLink className="mr-1 inline h-3.5 w-3.5" />Google Maps
              </button>
              {(navigationStatus === 'navigating' || navigationStatus === 'paused') && (
                <button type="button" onClick={onRecenterMap} className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold text-cyan-300">
                  <Crosshair className="mr-1 inline h-3.5 w-3.5" />Recenter map
                </button>
              )}
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-slate-500">
              Google Maps is an external handoff and may recalculate a different route.
            </p>
          </div>
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
              const riskCounts = data.feasible ? getRouteRiskCounts(data) : null;
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
                        {data.totalDistanceKm} km • {data.travelTimeMins} mins
                      </div>
                      <div className="text-slate-400">
                        Risk: <strong className="text-slate-200">{data.averageRiskScore}</strong>
                        <span className="text-slate-500"> ({data.safetyRating})</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        High {riskCounts?.high || 0} • Severe {riskCounts?.severe || 0} • Moderate {riskCounts?.moderate || 0} • Unknown {riskCounts?.unknown || 0}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {data.closuresAvoidedCount} closures avoided
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-red-400 font-semibold">Blocked</div>
                  )}
                </button>
              );
            })}
          </div>

          {routeBundle.safest.feasible && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 p-3 text-[11px] text-slate-200">
              <div className="font-bold text-emerald-300">Risk-aware recommendation</div>
              <p className="mt-1">
                The Safest option is selected by the current risk-aware route optimizer; risk values are estimates, not a safety guarantee.
                {routeBundle.safest.unknownRiskSegmentsCount > 0
                  ? ` ${routeBundle.safest.unknownRiskSegmentsCount} segment(s) have unknown risk, so this route cannot be confirmed completely safe.`
                  : ''}
              </p>
              {routeBundle.fastest.feasible &&
                routeBundle.safest.edges.map(edge => edge.id).join(',') !== routeBundle.fastest.edges.map(edge => edge.id).join(',') &&
                routeBundle.safest.averageRiskScore < routeBundle.fastest.averageRiskScore && (
                  <p className="mt-1 text-slate-300">
                    Compared with Fastest, it has lower average modeled risk and adds about{' '}
                    {Math.max(0, Math.round((routeBundle.safest.travelTimeMins - routeBundle.fastest.travelTimeMins) * 10) / 10)} minutes.
                  </p>
                )}
              {(() => {
                const riskCounts = getRouteRiskCounts(routeBundle.safest);
                const elevatedCount = riskCounts.high + riskCounts.severe;
                return elevatedCount > 0 ? (
                  <p className="mt-1 text-amber-200">
                    The recommended option still contains {elevatedCount} high/severe estimated-risk segment(s). Review their map details before travel.
                  </p>
                ) : null;
              })()}
            </div>
          )}

          {distinctRoutePathCount === 1 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-2.5 text-[11px] text-amber-200">
              Only one unique feasible road path was returned for these endpoints and vehicle restrictions. No alternate geometry is fabricated.
            </div>
          )}

          {routeConvergenceGroups.map(({ edgeIds, labels }) => (
            <div key={edgeIds.join(',')} className="text-[11px] bg-slate-800/80 border border-slate-700/80 text-slate-300 p-2.5 rounded-xl space-y-1">
              <div className="font-semibold text-cyan-300">Shared route geometry:</div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                {labels.join(' and ')} currently use the same backend road path for these endpoints ({edgeIds.join(' → ')}). The route objectives remain separate; no alternate geometry is fabricated.
              </p>
            </div>
          ))}

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

              <div className="max-h-64 overflow-y-auto pr-1">
                <div className="text-xs text-slate-200 border-l-2 border-emerald-500 pl-3 py-2">
                  <div className="font-bold">A – Starting location</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{routeBundle.originNode.name}</div>
                </div>
                {activeRoute.edges.map((e, idx) => {
                  const roadData = roads.find(road => road.id === e.id);
                  const relatedReports = reports.filter(report => report.roadId === e.id);
                  const hasVerifiedFlood = relatedReports.some(
                    report => report.verificationStatus === 'Verified' && report.reportType.toLowerCase().includes('flood')
                  );
                  const risk = e.riskScore;
                  const riskLabel = getRoadRiskLevel({ riskScore: risk, status: e.status });
                  return (
                    <div
                      key={`${e.id}-${idx}`}
                      className={`relative border-l-2 pl-3 py-2 transition-colors ${
                        navigationStatus === 'navigating' &&
                        hasFreshGpsFix &&
                        currentRouteEdgeIndex === idx
                          ? 'border-cyan-400 bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/30'
                          : 'border-slate-700'
                      }`}
                    >
                      <span className={`absolute -left-[5px] top-3 h-2.5 w-2.5 rounded-full ${
                        riskLabel === 'Low' ? 'bg-emerald-500' :
                        riskLabel === 'Moderate' ? 'bg-yellow-500' :
                        riskLabel === 'High' ? 'bg-orange-500' :
                        riskLabel === 'Unknown' ? 'bg-slate-500' : 'bg-red-500'
                      }`} />
                      {navigationStatus === 'navigating' &&
                        hasFreshGpsFix &&
                        currentRouteEdgeIndex === idx && (
                          <span className="mb-1 inline-block rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-200">
                            CURRENT ROAD
                          </span>
                        )}
                      <div className="flex items-start justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-100">Road segment {idx + 1}: {e.name || 'Road name unavailable'}</div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            {e.distanceKm !== null && e.distanceKm !== undefined ? `${e.distanceKm} km` : 'Distance unavailable'}
                            {' · '}{risk === null || risk === undefined ? 'Risk information unavailable' : `Risk ${risk}/100`}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          riskLabel === 'Low' ? 'bg-emerald-500/20 text-emerald-300' :
                          riskLabel === 'Moderate' ? 'bg-yellow-500/20 text-yellow-300' :
                          riskLabel === 'High' ? 'bg-orange-500/20 text-orange-300' :
                          riskLabel === 'Unknown' ? 'bg-slate-500/20 text-slate-300' : 'bg-red-500/20 text-red-300'
                        }`}>
                          {riskLabel}
                        </span>
                      </div>
                      {e.status === 'CLOSED' && (
                        <div className="mt-1 text-[10px] font-semibold text-red-300">Confirmed road closure</div>
                      )}
                      {e.status === 'VERIFIED_HAZARD' && (
                        <div className="mt-1 text-[10px] font-semibold text-red-300">Expert-verified flood hazard</div>
                      )}
                      {e.status === 'REPORTED_WATERLOGGING' && (
                        <div className="mt-1 text-[10px] text-amber-300">Unverified citizen waterlogging report</div>
                      )}
                      {hasVerifiedFlood && (
                        <div className="mt-1 text-[10px] font-bold text-red-300">Verified Flood Report</div>
                      )}
                      {riskLabel !== 'Low' && (
                        <div className="mt-1 space-y-0.5 text-[10px] text-slate-400">
                          <div>
                            Reason: {roadData?.statusReason || e.statusReason || roadData?.riskExplanation || e.riskExplanation || 'Data unavailable'}
                          </div>
                          <div>
                            Source: {roadData?.riskSources?.length
                              ? roadData.riskSources.join(', ')
                              : e.riskSources?.length
                              ? e.riskSources.join(', ')
                              : 'Data unavailable'}
                            {roadData?.riskObservationTimestamp || e.riskObservationTimestamp
                              ? ` · rainfall observed ${new Date(roadData?.riskObservationTimestamp || e.riskObservationTimestamp || '').toLocaleString()}`
                              : ''}
                            {roadData?.riskUpdatedAt || e.riskUpdatedAt || roadData?.lastUpdated || e.lastUpdated
                              ? ` · assessed ${new Date(roadData?.riskUpdatedAt || e.riskUpdatedAt || roadData?.lastUpdated || e.lastUpdated || '').toLocaleString()}`
                              : ''}
                          </div>
                        </div>
                      )}
                      {relatedReports
                        .slice(0, 2)
                        .map(report => (
                          <div key={report.id} className="mt-1 text-[10px] text-slate-400">
                            {report.reportType}: {report.verificationStatus} · {report.description || 'Details unavailable'} · {new Date(report.timestamp).toLocaleString()}
                          </div>
                        ))}
                    </div>
                  );
                })}
                <div className="border-l-2 border-red-500 pl-3 py-2 text-xs text-slate-200">
                  <div className="font-bold">B – Destination</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{routeBundle.targetNode.name}</div>
                </div>
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
