import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  RoadSegment,
  Shelter,
  Hospital,
  EmergencyFacility,
  CommunityReport,
  RoadNode,
  WaterwayFeature
} from '../types';
import { getOrderedRouteSegments, getRoadRiskLevel, GraphEdge, SelectedRoute } from '../utils/rules';
import { Layers, Compass, ZoomIn, ZoomOut, LocateFixed, AlertTriangle, Droplets } from 'lucide-react';

interface MapViewProps {
  roads: RoadSegment[];
  nodes: Record<string, RoadNode>;
  shelters: Shelter[];
  hospitals: Hospital[];
  emergencyFacilities: EmergencyFacility[];
  reports: CommunityReport[];
  waterways?: WaterwayFeature[];
  selectedRoute?: SelectedRoute | null;
  altRouteEdges?: RoadSegment[];
  startNode?: RoadNode;
  targetNode?: RoadNode;
  onSelectNode?: (nodeId: string) => void;
  selectedRoadId?: string | null;
  onSelectRoad?: (road: RoadSegment) => void;
  onGpsDetected?: (lat: number, lng: number) => void;
  onMapCoordinateClick?: (lat: number, lng: number) => void;
  currentGps?: {
    lat: number;
    lng: number;
    accuracy: number;
    heading: number | null;
    timestamp: number;
  } | null;
  followGps?: boolean;
  gpsTracking?: boolean;
  requestedLayer?: {
    id: number;
    layer: 'shelters' | 'hospitals' | 'reports';
    center?: [number, number];
  } | null;
}

function getSemanticRoadColor(road: Pick<RoadSegment, 'status' | 'riskScore'>): { color: string; dashArray?: string; weight: number } {
  if (road.status === 'CLOSED') {
    return { color: '#94a3b8', dashArray: '6, 6', weight: 4 };
  }
  const level = getRoadRiskLevel(road);
  if (level === 'Severe') return { color: '#ef4444', weight: 4 };
  if (level === 'High') return { color: '#f97316', weight: 4 };
  if (level === 'Moderate') return { color: '#eab308', weight: 4 };
  if (level === 'Unknown') return { color: '#64748b', dashArray: '3, 5', weight: 3 };
  return { color: '#10b981', weight: 4 };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[character];
  });
}

function formatMapTimestamp(value?: string): string {
  if (!value) return 'Data unavailable';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : escapeHtml(value);
}

function getRoadPopupContent(road: RoadSegment | GraphEdge, reports: CommunityReport[]): string {
  const level = getRoadRiskLevel(road);
  const relatedReports = reports.filter(
    report => report.roadId === road.id &&
      report.verificationStatus !== 'Rejected' &&
      report.verificationStatus !== 'Resolved'
  );
  const riskValue = road.riskScore === null
    ? 'Data unavailable'
    : `${road.riskScore}/100 (${road.riskCategory || level})`;
  const riskSources = 'riskSources' in road ? road.riskSources : undefined;
  const riskSource = riskSources?.length
    ? riskSources.map(escapeHtml).join(', ')
    : 'Data unavailable';
  const reason = road.statusReason || road.riskExplanation || 'Data unavailable';
  const verifiedBy = 'verifiedBy' in road ? road.verifiedBy : undefined;
  const expiresAt = 'expiresAt' in road ? road.expiresAt : undefined;
  const riskUpdatedAt = 'riskUpdatedAt' in road ? road.riskUpdatedAt : undefined;
  const riskObservationTimestamp = 'riskObservationTimestamp' in road ? road.riskObservationTimestamp : undefined;
  const lastUpdated = 'lastUpdated' in road ? road.lastUpdated : undefined;
  const slope = 'slopePct' in road ? road.slopePct : undefined;
  const drainage = 'drainageCondition' in road ? road.drainageCondition : undefined;
  const confidence = 'confidenceScore' in road ? road.confidenceScore : undefined;
  const oneWay = 'isOneWay' in road ? road.isOneWay : undefined;
  const reportDetails = relatedReports.length
    ? relatedReports.map(report => `
        <div style="margin-top:5px;border-top:1px solid #cbd5e1;padding-top:5px;">
          <strong>${escapeHtml(report.reportType)}</strong> · ${escapeHtml(report.verificationStatus)}
          <div>${escapeHtml(report.description || 'Details unavailable')}</div>
          <div>Reported: ${formatMapTimestamp(report.timestamp)}</div>
        </div>
      `).join('')
    : '<div>Data unavailable</div>';

  return `
    <div style="font-family:system-ui,sans-serif;min-width:230px;font-size:12px;color:#0f172a;">
      <div style="font-weight:700;font-size:13px;margin-bottom:5px;">${escapeHtml(road.name || 'Road name unavailable')}</div>
      <div><strong>Status:</strong> ${escapeHtml(road.status.replace(/_/g, ' '))}</div>
      <div><strong>Estimated flood risk:</strong> ${riskValue}</div>
      <div><strong>Reason:</strong> ${escapeHtml(reason)}</div>
      <div><strong>Distance / speed:</strong> ${road.distanceKm} km · ${road.speedKmph} km/h</div>
      <div><strong>Elevation / slope:</strong> ${road.baseElevationM ?? 'Data unavailable'} m · ${slope ?? 'Data unavailable'}%</div>
      <div><strong>Drainage:</strong> ${escapeHtml(drainage || 'Data unavailable')} · <strong>Confidence:</strong> ${typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : 'Data unavailable'}</div>
      ${oneWay ? '<div><strong>Direction:</strong> One-way</div>' : ''}
      ${road.status === 'CLOSED' ? `
        <div><strong>Closure verified by:</strong> ${escapeHtml(verifiedBy || 'Data unavailable')}</div>
        <div><strong>Closure active until:</strong> ${formatMapTimestamp(expiresAt || undefined)}</div>
      ` : ''}
      <div><strong>Risk data source:</strong> ${riskSource}</div>
      <div><strong>Risk assessment updated:</strong> ${formatMapTimestamp(riskUpdatedAt || lastUpdated)}</div>
      ${riskObservationTimestamp ? `<div><strong>Rainfall observation:</strong> ${formatMapTimestamp(riskObservationTimestamp)}</div>` : ''}
      <div style="margin-top:5px;"><strong>Related community reports:</strong>${reportDetails}</div>
    </div>
  `;
}

export const MapView: React.FC<MapViewProps> = ({
  roads,
  nodes,
  shelters,
  hospitals,
  emergencyFacilities,
  reports,
  waterways = [],
  selectedRoute,
  altRouteEdges,
  startNode,
  targetNode,
  onSelectNode,
  selectedRoadId,
  onSelectRoad,
  onGpsDetected,
  onMapCoordinateClick,
  currentGps,
  followGps,
  gpsTracking = false,
  requestedLayer
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const userGpsMarkerRef = useRef<L.Marker | null>(null);
  const gpsAccuracyCircleRef = useRef<L.Circle | null>(null);
  const fittedRouteKeyRef = useRef('');
  const lastRequestedLayerIdRef = useRef<number | null>(null);
  const pendingMapCenterRef = useRef<[number, number] | null>(null);

  const [showRoads, setShowRoads] = useState(true);
  const [showIntersections, setShowIntersections] = useState(false);
  const [showAlternativeRoute, setShowAlternativeRoute] = useState(false);
  const [showShelters, setShowShelters] = useState(false);
  const [showHospitals, setShowHospitals] = useState(false);
  const [showAnimals, setShowAnimals] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showWaterways, setShowWaterways] = useState(false);

  const [tileError, setTileError] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (!requestedLayer || lastRequestedLayerIdRef.current === requestedLayer.id) return;
    lastRequestedLayerIdRef.current = requestedLayer.id;
    if (requestedLayer.layer === 'shelters') setShowShelters(true);
    if (requestedLayer.layer === 'hospitals') setShowHospitals(true);
    if (requestedLayer.layer === 'reports') setShowReports(true);
    const requestedCenter = requestedLayer.center;
    if (requestedCenter) {
      const map = mapInstanceRef.current;
      if (map) {
        window.setTimeout(() => map.setView(requestedCenter, Math.max(map.getZoom(), 14), { animate: true }), 0);
      } else {
        pendingMapCenterRef.current = requestedCenter;
      }
    }
  }, [requestedLayer]);

  const onMapCoordinateClickRef = useRef(onMapCoordinateClick);
  useEffect(() => {
    onMapCoordinateClickRef.current = onMapCoordinateClick;
  }, [onMapCoordinateClick]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [18.535, 73.845],
      zoom: 12,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: false
    });

    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | SanketSetu Pune',
      maxZoom: 19
    });

    tiles.on('tileerror', () => {
      setTileError(true);
    });
    tiles.on('tileload', () => {
      setTileError(false);
    });

    tiles.addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapCoordinateClickRef.current) {
        onMapCoordinateClickRef.current(e.latlng.lat, e.latlng.lng);
      }
    });

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    const pendingCenter = pendingMapCenterRef.current;
    if (pendingCenter) {
      window.setTimeout(() => {
        map.setView(pendingCenter, Math.max(map.getZoom(), 14), { animate: true });
        pendingMapCenterRef.current = null;
      }, 0);
    }

    // Ensure proper dimensions when mounted inside flex/grid containers
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (!currentGps) {
      if (userGpsMarkerRef.current) {
        userGpsMarkerRef.current.remove();
        userGpsMarkerRef.current = null;
      }
      if (gpsAccuracyCircleRef.current) {
        gpsAccuracyCircleRef.current.remove();
        gpsAccuracyCircleRef.current = null;
      }
      return;
    }

    const heading = currentGps.heading !== null
      ? `<i style="position:absolute;left:4px;top:-12px;color:#2563eb;font-size:13px;font-style:normal;transform:rotate(${currentGps.heading}deg);">▲</i>`
      : '';
    const icon = L.divIcon({
      className: 'gps-live-pin',
      html: `<div class="gps-location-marker${gpsTracking ? ' gps-marker-pulse' : ''}"><span></span>${heading}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    if (userGpsMarkerRef.current) {
      userGpsMarkerRef.current.setLatLng([currentGps.lat, currentGps.lng]);
      userGpsMarkerRef.current.setIcon(icon);
      userGpsMarkerRef.current.setPopupContent(
        `Device GPS<br/>Accuracy: ${Math.round(currentGps.accuracy)} m<br/>Updated: ${new Date(currentGps.timestamp).toLocaleTimeString()}`
      );
    } else {
      userGpsMarkerRef.current = L.marker([currentGps.lat, currentGps.lng], { icon })
        .addTo(map)
        .bindPopup(`Device GPS<br/>Accuracy: ${Math.round(currentGps.accuracy)} m`);
    }
    if (currentGps.accuracy > 0 && currentGps.accuracy <= 1000) {
      if (gpsAccuracyCircleRef.current) {
        gpsAccuracyCircleRef.current.setLatLng([currentGps.lat, currentGps.lng]);
        gpsAccuracyCircleRef.current.setRadius(currentGps.accuracy);
      } else {
        gpsAccuracyCircleRef.current = L.circle([currentGps.lat, currentGps.lng], {
          radius: currentGps.accuracy,
          color: '#2563eb',
          weight: 1,
          opacity: 0.6,
          fillColor: '#60a5fa',
          fillOpacity: 0.12,
          interactive: false
        }).addTo(map);
      }
    } else if (gpsAccuracyCircleRef.current) {
      gpsAccuracyCircleRef.current.remove();
      gpsAccuracyCircleRef.current = null;
    }
    if (followGps) map.setView([currentGps.lat, currentGps.lng], Math.max(map.getZoom(), 15), { animate: true });
  }, [currentGps, followGps, gpsTracking]);

  // Re-render layers when state changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const roadsById = new Map(roads.map(road => [road.id, road]));

    // Closed roads remain visible as hazards even when the network risk layer is hidden.
    roads.forEach((road) => {
        if (!showRoads && road.status !== 'CLOSED') return;
        const style = getSemanticRoadColor(road);
        const isSelected = selectedRoadId === road.id;

        const polyline = L.polyline(road.coordinates, {
          color: isSelected && road.status !== 'CLOSED' ? '#38bdf8' : style.color,
          weight: isSelected && road.status !== 'CLOSED' ? 5 : road.status === 'CLOSED' ? 3 : 1.5,
          opacity: isSelected ? 0.9 : road.status === 'CLOSED' ? 0.8 : 0.42,
          dashArray: style.dashArray
        });

        polyline.bindPopup(getRoadPopupContent(road, reports));
        polyline.on('click', () => {
          onSelectRoad?.(road);
        });
        layerGroup.addLayer(polyline);
    });

    // 2. Alternative route ghost highlight (if any)
    if (showAlternativeRoute && altRouteEdges && altRouteEdges.length > 0) {
      altRouteEdges.forEach((edge) => {
        const altLine = L.polyline(edge.coordinates, {
          color: '#a855f7',
          weight: 7,
          opacity: 0.55,
          dashArray: '8, 8'
        });
        layerGroup.addLayer(altLine);
      });
    }

    // 3. Active route uses the selected backend result's ordered geometry.
    if (selectedRoute?.feasible && selectedRoute.geometry.length > 0) {
      const boundsPoints: L.LatLngExpression[] = selectedRoute.geometry;
      getOrderedRouteSegments(selectedRoute).forEach(({ edge, coordinates }) => {
        if (coordinates.length < 2) return;
        const road = roadsById.get(edge.id);
        const edgeRiskIsFresh = Boolean(edge.riskUpdatedAt || edge.lastUpdated);
        const routeRisk: RoadSegment | GraphEdge = road
          ? {
              ...road,
              ...edge,
              status: road.status === 'CLOSED' || !edgeRiskIsFresh ? road.status : edge.status,
              riskScore: edgeRiskIsFresh ? edge.riskScore : road.riskScore,
              riskCategory: (edgeRiskIsFresh ? edge.riskCategory : road.riskCategory) || road.riskCategory,
              riskSources: edge.riskSources || road.riskSources,
              riskExplanation: edge.riskExplanation || road.riskExplanation,
              riskObservationTimestamp: edge.riskObservationTimestamp || road.riskObservationTimestamp,
              riskUpdatedAt: edge.riskUpdatedAt || road.riskUpdatedAt,
              statusReason: road.statusReason || edge.statusReason,
              verifiedBy: road.verifiedBy || edge.verifiedBy,
              expiresAt: road.expiresAt || edge.expiresAt
            }
          : edge;
        const riskStyle = getSemanticRoadColor(routeRisk);
        const isClosed = routeRisk.status === 'CLOSED';
        const casing = L.polyline(coordinates, {
          color: isClosed ? '#475569' : '#ffffff',
          weight: 12,
          opacity: isClosed ? 0.55 : 0.95,
          lineCap: 'round',
          lineJoin: 'round'
        });
        layerGroup.addLayer(casing);
        const highlight = L.polyline(coordinates, {
          color: isClosed ? '#94a3b8' : riskStyle.color,
          weight: 8,
          opacity: isClosed ? 0.9 : 1,
          dashArray: isClosed ? '7, 7' : undefined,
          lineCap: 'round',
          lineJoin: 'round'
        });
        highlight.bindPopup(getRoadPopupContent(routeRisk, reports));
        highlight.on('click', () => {
          if (road) onSelectRoad?.(road);
        });
        layerGroup.addLayer(highlight);

        const riskLevel = getRoadRiskLevel(routeRisk);
        if (riskLevel === 'Moderate' || riskLevel === 'High' || riskLevel === 'Severe' || riskLevel === 'Closed') {
          const point = coordinates[Math.floor(coordinates.length / 2)];
          const markerColor = riskLevel === 'Moderate'
            ? '#eab308'
            : riskLevel === 'High'
            ? '#f97316'
            : riskLevel === 'Severe'
            ? '#ef4444'
            : '#64748b';
          const marker = L.marker(point, {
            icon: L.divIcon({
              className: 'route-risk-warning',
              html: `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border:2px solid #fff;border-radius:50%;background:${markerColor};color:#fff;font:bold 13px system-ui;box-shadow:0 2px 6px rgba(0,0,0,.45);">${riskLevel === 'Closed' ? '×' : '!'}</span>`,
              iconSize: [22, 22],
              iconAnchor: [11, 11]
            }),
            zIndexOffset: 700
          });
          marker.bindPopup(getRoadPopupContent(routeRisk, reports));
          if (road) marker.on('click', () => onSelectRoad?.(road));
          layerGroup.addLayer(marker);
        }
      });
      const routeKey = selectedRoute.edges.map(edge => edge.id).join(',');
      if (boundsPoints.length > 1 && routeKey !== fittedRouteKeyRef.current) {
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [45, 45], maxZoom: 14 });
        fittedRouteKeyRef.current = routeKey;
      }
    } else {
      fittedRouteKeyRef.current = '';
    }

    // 4. Optional road intersections
    if (showIntersections) Object.values(nodes).forEach((node) => {
      const icon = L.divIcon({
        className: 'custom-node-icon',
        html: '<div style="background:#64748b;width:8px;height:8px;border:1px solid #fff;border-radius:50%;"></div>',
        iconSize: [8, 8],
        iconAnchor: [4, 4]
      });

      const marker = L.marker([node.lat, node.lng], { icon });
      marker.bindPopup(`<div style="font-family:system-ui;font-size:12px;"><strong>${escapeHtml(node.name)}</strong><br/><span style="color:#64748b;">Elevation: ${node.elevationM ?? 'Unknown'} m</span><br/><button id="node-sel-${escapeHtml(node.id)}" style="margin-top:6px;background:#2563eb;color:#fff;border:0;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Use in Route Planner</button></div>`);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`node-sel-${node.id}`);
        if (btn && onSelectNode) {
          btn.onclick = () => onSelectNode(node.id);
        }
      });

      layerGroup.addLayer(marker);
    });

    // 5. Shelters
    if (showShelters) {
      shelters.forEach((shelter) => {
        const icon = L.divIcon({
          className: 'shelter-icon',
          html: `<div style="background: #2563eb; color: white; width: 26px; height: 26px; border-radius: 8px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 13px;">🏠</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        const occupancyPct = Math.round((shelter.currentOccupancy / shelter.capacity) * 100);
        const marker = L.marker([shelter.lat, shelter.lng], { icon });
        marker.bindPopup(`
          <div style="font-family: system-ui; font-size: 12px; min-width: 195px;">
            <div style="font-weight: bold; color: #1e3a8a; font-size: 13px;">${shelter.name}</div>
            <div style="color: #475569; margin: 3px 0;">${shelter.address}</div>
            <div style="margin: 5px 0; background: #f1f5f9; padding: 5px; border-radius: 4px;">
              <div>Occupancy: <strong>${shelter.currentOccupancy} / ${shelter.capacity}</strong> (${occupancyPct}%)</div>
              <div>Pets: <strong>${shelter.petFriendly ? 'Yes' : 'No'}</strong> • Wheelchair: <strong>${shelter.wheelchairAccessible ? 'Yes' : 'No'}</strong></div>
            </div>
            <div>Contact: <a href="tel:${shelter.contact}" style="color: #2563eb; font-weight: bold;">${shelter.contact}</a></div>
          </div>
        `);
        layerGroup.addLayer(marker);
      });
    }

    // 6. Hospitals
    if (showHospitals) {
      hospitals.forEach((hosp) => {
        const icon = L.divIcon({
          className: 'hosp-icon',
          html: `<div style="background: #dc2626; color: white; width: 26px; height: 26px; border-radius: 8px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 13px;">🏥</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });
        const marker = L.marker([hosp.lat, hosp.lng], { icon });
        marker.bindPopup(`
          <div style="font-family: system-ui; font-size: 12px; min-width: 195px;">
            <div style="font-weight: bold; color: #991b1b; font-size: 13px;">${hosp.name}</div>
            <div style="color: #64748b; font-size: 11px;">${hosp.type}</div>
            <div style="margin: 5px 0; background: #fef2f2; padding: 5px; border-radius: 4px;">
              <div>Total Beds: <strong>${hosp.totalBeds}</strong> • ICU: <strong>${hosp.availableIcu}</strong></div>
            </div>
            <div>Phone: <a href="tel:${hosp.contact}" style="color: #dc2626; font-weight: bold;">${hosp.contact}</a></div>
          </div>
        `);
        layerGroup.addLayer(marker);
      });
    }

    // 7. Animal Rescue
    if (showAnimals) {
      emergencyFacilities
        .filter(f => f.type === 'Animal Rescue' || f.type === 'Veterinary')
        .forEach((facility) => {
          if (typeof facility.lat !== 'number' || typeof facility.lng !== 'number') return;
          const icon = L.divIcon({
            className: 'animal-icon',
            html: `<div style="background: #059669; color: white; width: 26px; height: 26px; border-radius: 8px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 13px;">🐾</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          });
          const marker = L.marker([facility.lat, facility.lng], { icon });
          marker.bindPopup(`
            <div style="font-family: system-ui; font-size: 12px; min-width: 200px;">
              <div style="font-weight: bold; color: #065f46; font-size: 13px;">${facility.name}</div>
              <div style="color: #64748b; font-size: 11px;">${facility.specialization}</div>
              <div style="margin-top: 4px;">Hours: <strong>${facility.serviceHours}</strong></div>
              <div>Helpline: <a href="tel:${facility.contact}" style="color: #059669; font-weight: bold;">${facility.contact}</a></div>
            </div>
          `);
          layerGroup.addLayer(marker);
        });
    }

    // 8. Waterways / Drainage References
    if (showWaterways && waterways.length > 0) {
      waterways.forEach((w) => {
        const icon = L.divIcon({
          className: 'waterway-icon',
          html: `<div style="background: #0284c7; color: white; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 12px;">🌊</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        const marker = L.marker([w.lat, w.lng], { icon });
        marker.bindPopup(`
          <div style="font-family: system-ui; font-size: 12px; min-width: 210px;">
            <div style="font-weight: bold; color: #0369a1;">${w.name}</div>
            <div style="color: #475569; font-size: 11px;">Sector: ${w.sector} (${w.waterwayType})</div>
            <div style="margin: 4px 0; color: #334155;">${w.maintenanceNote}</div>
            <div style="font-size: 10px; color: #64748b;">
              Capacity Telemetry: <strong>${w.capacityKnown ? `${w.reportedCapacityCusecs} cusecs` : 'Unverified / Unknown'}</strong>
            </div>
          </div>
        `);
        layerGroup.addLayer(marker);
      });
    }

    // 9. Citizen Reports
    if (showReports) {
      reports
        .filter(r => r.verificationStatus !== 'Rejected' && r.verificationStatus !== 'Resolved')
        .forEach((report) => {
          const badgeColor =
            report.verificationStatus === 'Verified'
              ? '#ef4444'
              : report.severity === 'Critical'
              ? '#f97316'
              : '#eab308';

          const icon = L.divIcon({
            className: 'report-pin-icon',
            html: `<div style="background: ${badgeColor}; color: white; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">!</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });

          const marker = L.marker([report.lat, report.lng], { icon });
          marker.bindPopup(`
            <div style="font-family: system-ui; font-size: 12px; min-width: 210px;">
              <div style="font-weight: bold; color: #0f172a; font-size: 13px;">${report.locationName}</div>
              <div style="display: flex; gap: 4px; margin: 4px 0;">
                <span style="background: ${badgeColor}; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;">
                  ${report.severity}
                </span>
                <span style="background: #e2e8f0; color: #334155; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">
                  ${report.verificationStatus}
                </span>
              </div>
              <p style="color: #334155; margin: 5px 0;">${report.description}</p>
              <div style="font-size: 10px; color: #64748b;">
                Confidence: <strong>${Math.round(report.confidenceScore * 100)}%</strong>
              </div>
            </div>
          `);
          layerGroup.addLayer(marker);
        });
    }

    // Keep calculated route endpoints distinct from optional incident and facility layers.
    if (selectedRoute?.feasible && startNode && targetNode) {
        const createEndpointIcon = (letter: string, label: string, color: string) => L.divIcon({
          className: 'route-endpoint-icon',
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;white-space:nowrap;">
            <span style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border:3px solid #fff;border-radius:50%;background:${color};color:#fff;font-size:16px;font-weight:800;box-shadow:0 3px 10px rgba(0,0,0,.4);">${letter}</span>
            <span style="max-width:180px;overflow:hidden;text-overflow:ellipsis;border-radius:999px;background:#0f172a;color:#fff;padding:3px 8px;font:700 9px system-ui;box-shadow:0 2px 6px rgba(0,0,0,.35);">${label}</span>
          </div>`,
          iconSize: [190, 62],
          iconAnchor: [95, 19]
        });

        L.marker([startNode.lat, startNode.lng], {
          icon: createEndpointIcon('A', `START · ${escapeHtml(startNode.name)}`, '#16a34a'),
          zIndexOffset: 1000
        }).bindPopup(`<strong>START</strong><br/>${escapeHtml(startNode.name)}`).addTo(layerGroup);

        L.marker([targetNode.lat, targetNode.lng], {
          icon: createEndpointIcon('B', `DESTINATION · ${escapeHtml(targetNode.name)}`, '#dc2626'),
          zIndexOffset: 1000
        }).bindPopup(`<strong>DESTINATION</strong><br/>${escapeHtml(targetNode.name)}`).addTo(layerGroup);
    }
  }, [
    roads,
    nodes,
    shelters,
    hospitals,
    emergencyFacilities,
    reports,
    waterways,
    selectedRoute,
    altRouteEdges,
    startNode,
    targetNode,
    selectedRoadId,
    showRoads,
    showIntersections,
    showAlternativeRoute,
    showShelters,
    showHospitals,
    showAnimals,
    showReports,
    showWaterways,
    onSelectNode,
    onSelectRoad
  ]);

  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      setGpsNotice('GPS geolocation is not supported in this browser.');
      return;
    }
    setIsLocating(true);
    setGpsNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        const map = mapInstanceRef.current;
        map?.setView([latitude, longitude], 14);
        onGpsDetected?.(latitude, longitude);
        setGpsNotice(`Located at ${latitude.toFixed(4)}, ${longitude.toFixed(4)} · accuracy ${Math.round(pos.coords.accuracy)} m`);
      },
      (err) => {
        setIsLocating(false);
        setGpsNotice(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Please pick a Pune intersection manually.'
            : 'Unable to acquire GPS fix. Using Pune/PCMC road selector.'
        );
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  return (
    <div
      data-testid="pune-flood-map"
      data-active-edges={selectedRoute?.edges.map(e => e.id).join(',') || ''}
      data-active-route-mode={selectedRoute?.mode || ''}
      data-active-geometry-count={selectedRoute?.geometry.length || 0}
      data-active-geometry-available={selectedRoute?.geometryAvailable ? 'true' : 'false'}
      data-active-geometry-first={selectedRoute?.geometry[0]?.join(',') || ''}
      data-active-geometry-last={selectedRoute?.geometry.at(-1)?.join(',') || ''}
      data-alt-edges={altRouteEdges?.map(e => e.id).join(',') || ''}
      className="relative w-full h-full min-h-[400px] rounded-2xl overflow-hidden shadow-inner border border-slate-700 bg-slate-900"
    >
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Tile Load / Network Banner */}
      {tileError && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-amber-950/90 border border-amber-500/50 text-amber-200 px-3 py-1.5 rounded-lg text-[11px] flex items-center space-x-1.5 shadow-lg">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Map base tiles unavailable offline — road risk vectors remain active.</span>
        </div>
      )}

      {gpsNotice && (
        <div className="absolute top-14 left-4 z-20 bg-slate-900/95 border border-cyan-500/40 text-cyan-200 px-3 py-1.5 rounded-lg text-[11px] max-w-xs shadow-lg">
          {gpsNotice}
        </div>
      )}

      {/* Layer Controls HUD */}
      <div className="absolute top-3 right-3 z-10 max-h-[calc(100%-5.5rem)] overflow-y-auto bg-slate-900/95 backdrop-blur-md border border-slate-700 p-2.5 rounded-xl shadow-2xl text-[11px] space-y-1.5 text-slate-200 max-w-[175px]">
        <div className="flex items-center space-x-1.5 font-bold text-slate-100 border-b border-slate-700 pb-1">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>Map Layers</span>
        </div>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showRoads}
            onChange={(e) => setShowRoads(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span>Road Flood Risk</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showIntersections}
            onChange={(e) => setShowIntersections(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span>Intersections</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showAlternativeRoute}
            onChange={(e) => setShowAlternativeRoute(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span>Alternative route</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showShelters}
            onChange={(e) => setShowShelters(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span>Shelters</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showHospitals}
            onChange={(e) => setShowHospitals(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span>Hospitals</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showAnimals}
            onChange={(e) => setShowAnimals(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span>Animal Rescue</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showReports}
            onChange={(e) => setShowReports(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span>Citizen Incidents</span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showWaterways}
            onChange={(e) => setShowWaterways(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span className="flex items-center space-x-1">
            <Droplets className="w-3 h-3 text-sky-400" />
            <span>Rivers / Nullahs</span>
          </span>
        </label>
      </div>

      {/* Semantic Color Legend HUD */}
      <div className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-6rem)] bg-slate-900/95 backdrop-blur-md border border-slate-700 px-2.5 py-2 rounded-xl shadow-xl text-[9px] text-slate-300">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold text-white">Map key</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-green-600" />A Start</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-red-600" />B Destination</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500" />GPS</span>
          <span className="inline-flex items-center gap-1"><i className="h-1 w-4 rounded border border-white bg-slate-500" />Selected route</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />Low</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-yellow-500" />Moderate</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-orange-500" />High</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-red-500" />Severe</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full border border-slate-400 bg-slate-500" />Unknown</span>
          <span className="inline-flex items-center gap-1"><i className="h-0.5 w-4 border-t border-dashed border-slate-400" />Closed</span>
        </div>
      </div>

      {/* Zoom & GPS Controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-col space-y-1">
        <button
          type="button"
          onClick={() => mapInstanceRef.current?.zoomIn()}
          aria-label="Zoom in map"
          className="p-2 bg-slate-900/85 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg shadow"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => mapInstanceRef.current?.zoomOut()}
          aria-label="Zoom out map"
          className="p-2 bg-slate-900/85 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg shadow"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => mapInstanceRef.current?.setView([18.535, 73.845], 12)}
          aria-label="Recenter map to Pune"
          className="p-2 bg-slate-900/85 hover:bg-slate-800 text-cyan-400 border border-slate-700 rounded-lg shadow"
          title="Recenter Pune & PCMC"
        >
          <Compass className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleLocateUser}
          disabled={isLocating}
          aria-label="Detect GPS location"
          className="p-2 bg-slate-900/85 hover:bg-slate-800 text-emerald-400 border border-slate-700 rounded-lg shadow"
          title="Use Current GPS Location"
        >
          <LocateFixed className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
