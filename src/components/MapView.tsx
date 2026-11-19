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
import { Layers, Compass, ZoomIn, ZoomOut, LocateFixed, AlertTriangle, Droplets } from 'lucide-react';

interface MapViewProps {
  roads: RoadSegment[];
  nodes: Record<string, RoadNode>;
  shelters: Shelter[];
  hospitals: Hospital[];
  emergencyFacilities: EmergencyFacility[];
  reports: CommunityReport[];
  waterways?: WaterwayFeature[];
  activeRouteEdges?: RoadSegment[];
  altRouteEdges?: RoadSegment[];
  startNode?: RoadNode;
  targetNode?: RoadNode;
  onSelectNode?: (nodeId: string) => void;
  selectedRoadId?: string | null;
  onSelectRoad?: (road: RoadSegment) => void;
  onGpsDetected?: (lat: number, lng: number) => void;
}

function getSemanticRoadColor(road: RoadSegment): { color: string; dashArray?: string; weight: number } {
  if (road.status === 'CLOSED') {
    return { color: '#dc2626', dashArray: '6, 8', weight: 6 }; // Red dashed = Closed
  }
  if (road.status === 'VERIFIED_HAZARD' || (road.riskScore !== null && road.riskScore >= 75)) {
    return { color: '#ef4444', weight: 6 }; // Red = Severe / Verified Hazard
  }
  if (road.riskScore === null || road.status === 'UNKNOWN') {
    return { color: '#64748b', dashArray: '3, 5', weight: 4 }; // Grey = Unknown
  }
  if (road.riskScore >= 50) {
    return { color: '#f97316', weight: 5 }; // Orange = High Risk
  }
  if (road.riskScore >= 25 || road.status === 'REPORTED_WATERLOGGING') {
    return { color: '#eab308', weight: 5 }; // Yellow = Moderate / Reported Waterlogging
  }
  return { color: '#10b981', weight: 4 }; // Green = Low Risk
}

export const MapView: React.FC<MapViewProps> = ({
  roads,
  nodes,
  shelters,
  hospitals,
  emergencyFacilities,
  reports,
  waterways = [],
  activeRouteEdges,
  altRouteEdges,
  startNode,
  targetNode,
  onSelectNode,
  selectedRoadId,
  onSelectRoad,
  onGpsDetected
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const userGpsMarkerRef = useRef<L.Marker | null>(null);

  const [showRoads, setShowRoads] = useState(true);
  const [showShelters, setShowShelters] = useState(true);
  const [showHospitals, setShowHospitals] = useState(true);
  const [showAnimals, setShowAnimals] = useState(true);
  const [showReports, setShowReports] = useState(true);
  const [showWaterways, setShowWaterways] = useState(false);

  const [tileError, setTileError] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

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

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    // Ensure proper dimensions when mounted inside flex/grid containers
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Re-render layers when state changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // 1. Road Segments
    if (showRoads) {
      roads.forEach((road) => {
        const style = getSemanticRoadColor(road);
        const isSelected = selectedRoadId === road.id;

        const polyline = L.polyline(road.coordinates, {
          color: isSelected ? '#38bdf8' : style.color,
          weight: isSelected ? 8 : style.weight,
          opacity: road.status === 'CLOSED' ? 0.9 : 0.85,
          dashArray: style.dashArray
        });

        const riskText = road.riskScore === null ? 'Unknown' : `${road.riskScore}/100 (${road.riskCategory})`;
        const popupContent = `
          <div style="font-family: system-ui, sans-serif; min-width: 230px; font-size: 12px; color: #0f172a;">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 4px;">${road.name}</div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 8px;">
              <span style="background: ${style.color}; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;">
                Risk: ${riskText}
              </span>
              <span style="background: #e2e8f0; color: #1e293b; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;">
                ${road.status.replace(/_/g, ' ')}
              </span>
              ${road.isOneWay ? '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">ONE-WAY</span>' : ''}
            </div>
            <div style="color: #334155; line-height: 1.5;">
              <div>• Distance: <strong>${road.distanceKm} km</strong> • Speed: <strong>${road.speedKmph} km/h</strong></div>
              <div>• Elevation: <strong>${road.baseElevationM ?? 'N/A'} m</strong> (Slope: ${road.slopePct ?? 'N/A'}%)</div>
              <div>• Drainage: <strong style="text-transform: capitalize;">${road.drainageCondition}</strong></div>
              <div>• Confidence: <strong>${Math.round(road.confidenceScore * 100)}%</strong></div>
              ${road.statusReason ? `<div style="margin-top:4px;color:#b91c1c;font-size:11px;"><strong>Note:</strong> ${road.statusReason}</div>` : ''}
            </div>
          </div>
        `;

        polyline.bindPopup(popupContent);
        polyline.on('click', () => {
          onSelectRoad?.(road);
        });
        layerGroup.addLayer(polyline);
      });
    }

    // 2. Alternative route ghost highlight (if any)
    if (altRouteEdges && altRouteEdges.length > 0) {
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

    // 3. Active Route Highlight
    if (activeRouteEdges && activeRouteEdges.length > 0) {
      const boundsPoints: L.LatLngExpression[] = [];
      activeRouteEdges.forEach((edge) => {
        edge.coordinates.forEach(c => boundsPoints.push(c));
        const highlight = L.polyline(edge.coordinates, {
          color: '#06b6d4',
          weight: 8,
          opacity: 0.95
        });
        layerGroup.addLayer(highlight);
      });
      if (boundsPoints.length > 1) {
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [45, 45], maxZoom: 14 });
      }
    }

    // 4. Road Intersection Nodes
    Object.values(nodes).forEach((node) => {
      const isStart = startNode?.id === node.id;
      const isTarget = targetNode?.id === node.id;

      let bgColor = '#3b82f6';
      let label = '';
      if (isStart) {
        bgColor = '#10b981';
        label = 'A';
      } else if (isTarget) {
        bgColor = '#ef4444';
        label = 'B';
      }

      const icon = L.divIcon({
        className: 'custom-node-icon',
        html: `<div style="background-color: ${bgColor}; color: #fff; width: ${isStart || isTarget ? '26px' : '12px'}; height: ${isStart || isTarget ? '26px' : '12px'}; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;">${label}</div>`,
        iconSize: isStart || isTarget ? [26, 26] : [12, 12],
        iconAnchor: isStart || isTarget ? [13, 13] : [6, 6]
      });

      const marker = L.marker([node.lat, node.lng], { icon });
      marker.bindPopup(`
        <div style="font-family: system-ui; font-size: 12px;">
          <strong>${node.name}</strong><br/>
          <span style="color: #64748b;">Elevation: ${node.elevationM ?? 'Unknown'} m (Copernicus DEM)</span><br/>
          <button id="node-sel-${node.id}" style="margin-top: 6px; background: #2563eb; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">
            Use in Route Planner
          </button>
        </div>
      `);

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
  }, [
    roads,
    nodes,
    shelters,
    hospitals,
    emergencyFacilities,
    reports,
    waterways,
    activeRouteEdges,
    altRouteEdges,
    startNode,
    targetNode,
    selectedRoadId,
    showRoads,
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
        if (map) {
          map.setView([latitude, longitude], 14);
          if (userGpsMarkerRef.current) {
            userGpsMarkerRef.current.remove();
          }
          userGpsMarkerRef.current = L.marker([latitude, longitude], {
            icon: L.divIcon({
              className: 'gps-pin',
              html: `<div style="width:16px;height:16px;background:#06b6d4;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(6,182,212,0.35);"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            })
          })
            .addTo(map)
            .bindPopup('Your Detected Location');
        }
        onGpsDetected?.(latitude, longitude);
        setGpsNotice(`Located at ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
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
      data-active-edges={activeRouteEdges?.map(e => e.id).join(',') || ''}
      data-alt-edges={altRouteEdges?.map(e => e.id).join(',') || ''}
      className="relative w-full h-full min-h-[460px] rounded-2xl overflow-hidden shadow-inner border border-slate-700 bg-slate-900"
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
      <div className="absolute top-3 right-3 z-10 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-2.5 rounded-xl shadow-2xl text-[11px] space-y-1.5 text-slate-200 max-w-[175px]">
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
      <div className="hidden sm:flex absolute bottom-3 left-3 z-10 bg-slate-900/90 backdrop-blur-md border border-slate-700 px-3 py-1.5 rounded-xl shadow-xl text-[11px] text-slate-300 items-center space-x-3">
        <span className="font-bold text-slate-200">Risk:</span>
        <span className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
          <span>Low</span>
        </span>
        <span className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded bg-yellow-500 inline-block" />
          <span>Mod</span>
        </span>
        <span className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded bg-orange-500 inline-block" />
          <span>High</span>
        </span>
        <span className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded bg-red-500 inline-block" />
          <span>Severe/Closed</span>
        </span>
        <span className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded bg-slate-500 inline-block" />
          <span>Unknown</span>
        </span>
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
