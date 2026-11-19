# SanketSetu — Data Sources, Transparency & Limitations

**Region:** Pune and Pimpri-Chinchwad (PCMC), Maharashtra, India  
**Methodology:** Transparent, rule-based geospatial indexing and directed road-graph routing (not a black-box trained ML model).

---

## 1. Gridded Precipitation Estimates
- **Primary Source:** [Open-Meteo Weather API](https://open-meteo.com/) (`https://api.open-meteo.com/v1/forecast`)
- **Grid points (`src/data/puneData.ts`):** Shivajinagar (`18.5314, 73.8446`), Pashan (`18.5388, 73.7915`), Lohegaon (`18.5822, 73.9197`), Chinchwad (`18.6298, 73.7997`), Khadakwasla (`18.4450, 73.7750`), Swargate (`18.4806, 73.8580`), Hadapsar (`18.5011, 73.9261`), Bhosari (`18.6242, 73.8355`), and Nigdi (`18.6518, 73.7659`).
- **Variables:** The service sums hourly precipitation estimates for the 24 hours before the current hour, reads the current-hour estimate, and sums the following 24-hour forecast. The requested grid resolution is approximately 11 km.
- **Limitations:** These are gridded model estimates, not rain-gauge observations or street-level flood measurements. Successful values are labeled `MODEL_ESTIMATE`; unavailable responses are not replaced with invented rainfall.
- **Cache & Freshness:** Successful or partially successful feeds are cached in process memory for 15 minutes. Failed stations are marked unavailable; an all-stations-failed response is not cached.
- **IMD Status:** The service does not call the IMD API, even when `IMD_API_KEY` is configured. The key status is reported separately and is not evidence that IMD data was fetched.

---

## 2. Road Network Geometry & Graph
- **File:** `src/data/roads.json` (GeoJSON FeatureCollection)
- **Source:** OpenStreetMap (ODbL) road features with OSRM routing geometry across Pune and Pimpri-Chinchwad.
- **Coverage:** **69 intersections/junctions (`RoadNode`)** and **108 directed corridor segments (`RoadSegment`)**, as reported by the running API, including:
  - Arterial highways, river bridges (Mula, Mutha, Pavana), causeways, and underpasses.
  - Attributes: `distanceKm`, `speedKmph`, `isOneWay`, `accessRestriction` (`all_vehicles`, `no_heavy_vehicles`, `emergency_only`), `isBridge`, `isTunnel`, `hasHistoricalFlood`, `waterwayProximity`.
- **Coordinates:** GeoJSON geometry is `[longitude, latitude]`; the loader converts it to the application/Leaflet `[latitude, longitude]` order.
- **Coordinate Snapping:** Arbitrary `(lat, lng)` GPS points or OpenStreetMap Nominatim geocoded addresses are snapped to the nearest road segment and intersection node (`snapCoordinateToRoadNetwork`). Haversine distance is used strictly for coordinate snapping, never as road travel distance.
- **TomTom Traffic:** `GET /api/traffic/status` reports live traffic only after successful TomTom responses remain in the three-minute cache. Route calculations query at most 12 candidate-road segments; unsampled roads use estimated road-class speeds, and `/api/routes/find` includes `dataQuality.warnings` and coverage counts.

---

## 3. Elevation & Terrain
- **File:** `datasets/processed/terrain.csv` and embedded node/corridor properties in `roads.geojson`
- **Source:** Copernicus DEM GLO-90 (~90m / 30m-class global elevation sampling across Pune/PCMC).
- **Range:** ~542m along Mutha/Mula riverbeds up to ~635m near Katraj and Baner/Pashan ridges.

---

## 4. Waterways & Drainage Inventory
- **File:** `datasets/processed/drainage.csv` and `INITIAL_WATERWAYS` in `src/data/puneData.ts`
- **Source:** OpenStreetMap waterways (Mutha River, Mula River, Pavana River, Indrayani River, Ambil Odha, Nagzari Nala, Bhairoba Nala, Ram Nadi).
- **Honest Limitations:** Quantitative real-time culvert/stormwater pipe capacities (`reportedCapacityCusecs`) are **not** publicly published in machine-readable feeds for Pune/PCMC. Therefore, `capacityKnown` is explicitly set to `false` (`reportedCapacityCusecs: null`), and unknown drainage scores fall back to a precautionary baseline (`55/100`) while lowering `confidenceScore`.

---

## 5. Historical Floods, Shelters & Hospitals
- **Historical Floods (`datasets/processed/historical_floods.csv`):** Documented flood events (2019 Ambil Odha / Sinhagad Road flash flood, 2021 Mutha riverbank swell, 2023–2024 Pavana & Ekta Nagari inundation events).
- **Shelters & Rescue Directories (`datasets/processed/shelters.csv`, `hospitals.csv`, `emergency_facilities.csv`):** PMC & PCMC relief shelter locations, trauma hospitals, NDRF 5th Battalion, Fire Brigade, and RESQ Charitable Trust animal flood rescue contacts. Live bed/occupancy counts represent baseline capacity unless updated via authenticated Expert overrides (`PATCH /api/shelters/:id`).
- **Synthetic Fixtures (`datasets/synthetic/synthetic_demo_data.csv`):** Retained strictly for offline stress-testing and unit fixtures; never presented as live city telemetry.

---

## 6. Risk Scoring & Routing Transparency
1. **5-Factor Weighted Linear Flood Risk Index (`src/utils/rules.ts`):**
   $$R = 0.30 F_{\text{rain}} + 0.20 F_{\text{terrain}} + 0.15 F_{\text{drainage}} + 0.15 F_{\text{historical}} + 0.20 F_{\text{community}}$$
   - Missing inputs use precautionary non-zero baselines and reduce `dataCompletenessPct` and `confidenceScore`.
   - If $\ge 4$ core factors are unavailable, `riskScore` is `null` and category is `Unknown`.
   - Contradictions (e.g., severe citizen waterlogging reports with 0 mm rainfall) trigger `contradictionDetected = true`.
2. **Routing Cost Objective (`Safest` mode):**
   $$C(e) = T(e) + \lambda \cdot R_{\text{time}}(e) \quad \text{(minutes)}$$
   where $T(e)$ is speed-adjusted segment travel time in minutes, and $R_{\text{time}}(e) = \left(\frac{\text{riskScore}}{100}\right) \times 18.0 \times \text{statusMultiplier}$ converts normalized flood risk into equivalent delay minutes.
3. **Closure Governance:** Citizen reports mark a corridor as `REPORTED_WATERLOGGING` (caution warning only) and **never** close a road automatically. Only verified `EXPERT` users can officially mark a road `CLOSED` (with a mandatory audit reason and optional expiry).
