import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { RoadSegment, Shelter, Hospital, EmergencyFacility, CommunityReport, RoadNode } from '../types';
import { Shield, Cross, Heart, AlertTriangle, Eye, Layers, Compass, ZoomIn, ZoomOut } from 'lucide-react';

interface MapViewProps {
  roads: RoadSegment[];
  nodes: Record<string, RoadNode>;
  shelters: Shelter[];
  hospitals: Hospital[];
  emergencyFacilities: EmergencyFacility[];
  reports: CommunityReport[];
  activeRouteEdges?: RoadSegment[];
  startNode?: RoadNode;
  targetNode?: RoadNode;
  onSelectNode?: (nodeId: string) => void;
  selectedRoadId?: string | null;
  onSelectRoad?: (road: RoadSegment) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  roads,
  nodes,
  shelters,
  hospitals,
  emergencyFacilities,
  reports,
  activeRouteEdges,
  startNode,
  targetNode,
  onSelectNode,
  selectedRoadId,
  onSelectRoad
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Layer visibility toggles
  const [showRoads, setShowRoads] = useState(true);
  const [showShelters, setShowShelters] = useState(true);
  const [showHospitals, setShowHospitals] = useState(true);
  const [showAnimals, setShowAnimals] = useState(true);
  const [showReports, setShowReports] = useState(true);

  // Initialize Map once
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Centered on Pune City (Deccan / Shivajinagar / Swargate nexus)
    const map = L.map(mapContainerRef.current, {
      center: [18.5204, 73.8567],
      zoom: 12,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | FloodGuard Pune',
      maxZoom: 19
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update map layers whenever data or layer toggles change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // 1. Render Road Segments
    if (showRoads) {
      roads.forEach((road) => {
        let color = '#10b981'; // Green
        let dashArray: string | undefined = undefined;

        if (road.status === 'blocked') {
          color = '#dc2626'; // Red
          dashArray = '6, 8';
        } else if (road.riskScore >= 80 || road.status === 'critical_waterlogged') {
          color = '#ef4444'; // Red
        } else if (road.riskScore >= 60) {
          color = '#f97316'; // Orange
        } else if (road.riskScore >= 40) {
          color = '#eab308'; // Yellow
        } else if (road.riskScore >= 20) {
          color = '#84cc16'; // Lime
        }

        const isSelected = selectedRoadId === road.id;

        const polyline = L.polyline(road.coordinates, {
          color: isSelected ? '#38bdf8' : color,
          weight: isSelected ? 8 : (road.status === 'critical_waterlogged' ? 6 : 5),
          opacity: 0.85,
          dashArray
        });

        const popupContent = `
          <div style="font-family: system-ui, sans-serif; min-width: 220px; font-size: 13px;">
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px; color: #0f172a;">${road.name}</div>
            <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 8px;">
              <span style="background: ${color}; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700;">
                Risk: ${road.riskScore}/100
              </span>
              <span style="background: #e2e8f0; color: #334155; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase;">
                ${road.status.replace('_', ' ')}
              </span>
            </div>
            <div style="color: #475569; line-height: 1.4;">
              <div>• Distance: <strong>${road.distanceKm} km</strong></div>
              <div>• Elevation: <strong>${road.baseElevationM} m</strong> (Slope: ${road.slopePct}%)</div>
              <div>• Drainage: <strong style="text-transform: capitalize;">${road.drainageCondition}</strong></div>
              <div>• Speed Est.: <strong>${road.speedKmph} km/h</strong></div>
            </div>
          </div>
        `;

        polyline.bindPopup(popupContent);
        polyline.on('click', () => {
          if (onSelectRoad) onSelectRoad(road);
        });

        layerGroup.addLayer(polyline);
      });
    }

    // 2. Render Active Calculated Route (Highlight overlay)
    if (activeRouteEdges && activeRouteEdges.length > 0) {
      activeRouteEdges.forEach((edge) => {
        const highlight = L.polyline(edge.coordinates, {
          color: '#06b6d4', // Vibrant Cyan glow
          weight: 9,
          opacity: 0.95
        });
        layerGroup.addLayer(highlight);
      });
    }

    // 3. Render Graph Nodes (Interactive intersections)
    Object.values(nodes).forEach((node) => {
      const isStart = startNode?.id === node.id;
      const isTarget = targetNode?.id === node.id;

      let bgColor = '#3b82f6';
      let label = '•';
      if (isStart) {
        bgColor = '#10b981';
        label = 'A';
      } else if (isTarget) {
        bgColor = '#ef4444';
        label = 'B';
      }

      const icon = L.divIcon({
        className: 'custom-node-icon',
        html: `<div style="background-color: ${bgColor}; color: #fff; width: ${isStart || isTarget ? '26px' : '16px'}; height: ${isStart || isTarget ? '26px' : '16px'}; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold;">${isStart || isTarget ? label : ''}</div>`,
        iconSize: isStart || isTarget ? [26, 26] : [16, 16],
        iconAnchor: isStart || isTarget ? [13, 13] : [8, 8]
      });

      const marker = L.marker([node.lat, node.lng], { icon });
      marker.bindPopup(`
        <div style="font-family: system-ui; font-size: 13px;">
          <strong>${node.name}</strong><br/>
          <span style="color: #64748b;">Elevation: ${node.elevationM}m</span><br/>
          <button id="node-sel-${node.id}" style="margin-top: 6px; background: #2563eb; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">
            Set As Origin / Destination
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

    // 4. Render Emergency Shelters
    if (showShelters) {
      shelters.forEach((shelter) => {
        const icon = L.divIcon({
          className: 'shelter-icon',
          html: `<div style="background: #2563eb; color: white; width: 28px; height: 28px; border-radius: 8px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 14px;">🏠</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        const occupancyPct = Math.round((shelter.currentOccupancy / shelter.capacity) * 100);

        const marker = L.marker([shelter.lat, shelter.lng], { icon });
        marker.bindPopup(`
          <div style="font-family: system-ui; font-size: 13px; min-width: 200px;">
            <div style="font-weight: bold; color: #1e3a8a; font-size: 14px;">${shelter.name}</div>
            <div style="color: #475569; margin: 4px 0;">${shelter.address}</div>
            <div style="margin: 6px 0; background: #f1f5f9; padding: 6px; border-radius: 4px;">
              <div>Capacity: <strong>${shelter.capacity}</strong> (Occupied: <strong>${shelter.currentOccupancy}</strong> / ${occupancyPct}%)</div>
              <div>Pets Allowed: <strong>${shelter.petFriendly ? '✅ Yes' : '❌ No'}</strong></div>
              <div>Wheelchair: <strong>${shelter.wheelchairAccessible ? '✅ Yes' : '❌ No'}</strong></div>
            </div>
            <div>Emergency Contact: <a href="tel:${shelter.contact}" style="color: #2563eb; font-weight: bold;">${shelter.contact}</a></div>
          </div>
        `);
        layerGroup.addLayer(marker);
      });
    }

    // 5. Render Hospitals
    if (showHospitals) {
      hospitals.forEach((hosp) => {
        const icon = L.divIcon({
          className: 'hosp-icon',
          html: `<div style="background: #dc2626; color: white; width: 28px; height: 28px; border-radius: 8px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 14px;">🏥</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        const marker = L.marker([hosp.lat, hosp.lng], { icon });
        marker.bindPopup(`
          <div style="font-family: system-ui; font-size: 13px; min-width: 200px;">
            <div style="font-weight: bold; color: #991b1b; font-size: 14px;">${hosp.name}</div>
            <div style="color: #64748b; font-size: 11px;">${hosp.type}</div>
            <div style="margin: 6px 0; background: #fef2f2; padding: 6px; border-radius: 4px; color: #334155;">
              <div>Total Beds: <strong>${hosp.totalBeds}</strong></div>
              <div>Available ICU Beds: <strong>${hosp.availableIcu}</strong></div>
              <div>Trauma Center: <strong>${hosp.hasTraumaCenter ? '✅ 24x7 Ready' : 'Limited'}</strong></div>
            </div>
            <div>Phone: <a href="tel:${hosp.contact}" style="color: #dc2626; font-weight: bold;">${hosp.contact}</a></div>
          </div>
        `);
        layerGroup.addLayer(marker);
      });
    }

    // 6. Render Animal Rescue Facilities
    if (showAnimals) {
      emergencyFacilities
        .filter(f => f.type === 'Animal Rescue' || f.type === 'Veterinary')
        .forEach((facility) => {
          const icon = L.divIcon({
            className: 'animal-icon',
            html: `<div style="background: #059669; color: white; width: 28px; height: 28px; border-radius: 8px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 14px;">🐾</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });

          const marker = L.marker([facility.lat, facility.lng], { icon });
          marker.bindPopup(`
            <div style="font-family: system-ui; font-size: 13px; min-width: 210px;">
              <div style="font-weight: bold; color: #065f46; font-size: 14px;">${facility.name}</div>
              <div style="color: #64748b; font-size: 11px;">${facility.specialization}</div>
              <div style="margin: 6px 0; background: #ecfdf5; padding: 6px; border-radius: 4px; color: #047857;">
                <div>Hours: <strong>${facility.serviceHours}</strong></div>
              </div>
              <div>Rescue Helpline: <a href="tel:${facility.contact}" style="color: #059669; font-weight: bold;">${facility.contact}</a></div>
            </div>
          `);
          layerGroup.addLayer(marker);
        });
    }

    // 7. Render Citizen Reports
    if (showReports) {
      reports.forEach((report) => {
        let badgeColor = '#f97316';
        if (report.severity === 'Critical') badgeColor = '#ef4444';
        else if (report.severity === 'Low') badgeColor = '#3b82f6';

        const icon = L.divIcon({
          className: 'report-pin-icon',
          html: `<div style="background: ${badgeColor}; color: white; width: 26px; height: 26px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">⚠️</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        const marker = L.marker([report.lat, report.lng], { icon });
        marker.bindPopup(`
          <div style="font-family: system-ui; font-size: 13px; min-width: 220px;">
            <div style="font-weight: bold; color: #0f172a; font-size: 14px;">${report.locationName}</div>
            <div style="display: flex; gap: 4px; margin: 4px 0;">
              <span style="background: ${badgeColor}; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;">
                ${report.severity}
              </span>
              <span style="background: #e2e8f0; color: #334155; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">
                ${report.verificationStatus}
              </span>
            </div>
            <p style="color: #334155; margin: 6px 0; font-size: 12px;">${report.description}</p>
            <div style="font-size: 11px; color: #64748b;">
              Confidence: <strong>${Math.round(report.confidenceScore * 100)}%</strong> • ${new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
    activeRouteEdges,
    startNode,
    targetNode,
    selectedRoadId,
    showRoads,
    showShelters,
    showHospitals,
    showAnimals,
    showReports,
    onSelectNode,
    onSelectRoad
  ]);

  return (
    <div className="relative w-full h-full min-h-[500px] rounded-2xl overflow-hidden shadow-inner border border-slate-700 bg-slate-900">
      {/* Map DOM Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Layer Controls HUD */}
      <div className="absolute top-4 right-4 z-10 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-2 text-slate-200">
        <div className="flex items-center space-x-1.5 font-bold text-slate-100 border-b border-slate-700 pb-1.5">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>Map Overlays</span>
        </div>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showRoads}
            onChange={(e) => setShowRoads(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span>Road Flood Risk</span>
          </span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showShelters}
            onChange={(e) => setShowShelters(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span className="flex items-center space-x-1.5">
            <span>🏠</span>
            <span>Flood Shelters</span>
          </span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showHospitals}
            onChange={(e) => setShowHospitals(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span className="flex items-center space-x-1.5">
            <span>🏥</span>
            <span>Hospitals & ICU</span>
          </span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showAnimals}
            onChange={(e) => setShowAnimals(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span className="flex items-center space-x-1.5">
            <span>🐾</span>
            <span>Animal Rescue (RESQ)</span>
          </span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showReports}
            onChange={(e) => setShowReports(e.target.checked)}
            className="rounded border-slate-600 text-blue-600 focus:ring-0"
          />
          <span className="flex items-center space-x-1.5">
            <span>⚠️</span>
            <span>Citizen Incidents</span>
          </span>
        </label>
      </div>

      {/* Map Legend HUD */}
      <div className="absolute bottom-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md border border-slate-700 px-3 py-2 rounded-xl shadow-xl text-[11px] text-slate-300 flex items-center space-x-3">
        <span className="font-bold text-slate-200">Flood Hazard:</span>
        <span className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
          <span>Low (0-30)</span>
        </span>
        <span className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded bg-amber-400 inline-block" />
          <span>Mod (30-60)</span>
        </span>
        <span className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded bg-orange-500 inline-block" />
          <span>High (60-80)</span>
        </span>
        <span className="flex items-center space-x-1">
          <span className="w-2.5 h-2.5 rounded bg-red-600 inline-block" />
          <span>Critical / Blocked</span>
        </span>
      </div>

      {/* Zoom Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col space-y-1">
        <button
          onClick={() => mapInstanceRef.current?.zoomIn()}
          aria-label="Zoom in map"
          className="p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg shadow"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => mapInstanceRef.current?.zoomOut()}
          aria-label="Zoom out map"
          className="p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg shadow"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => mapInstanceRef.current?.setView([18.5204, 73.8567], 12)}
          aria-label="Reset map view to Pune"
          className="p-2 bg-slate-900/80 hover:bg-slate-800 text-cyan-400 border border-slate-700 rounded-lg shadow"
          title="Reset to Pune Center"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
