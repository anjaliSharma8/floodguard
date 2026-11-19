# SanketSetu — Data Sources, Transparency & Limitations

**Region:** Pune and Pimpri-Chinchwad (PCMC), Maharashtra, India  
**Methodology:** Transparent, rule-based geospatial indexing and directed road-graph routing (not a black-box trained ML model).

---

## 1. Live & Forecast Precipitation
- **Primary Source:** [Open-Meteo Weather API](https://open-meteo.com/) (`https://api.open-meteo.com/v1/forecast`)
- **Stations Polled (`src/services/weatherService.ts`):**
  - Shivajinagar (`STN_SHIVAJI`: `18.5308, 73.8475`)
  - Sinhagad Road / Vadgaon Bk (`STN_SINHAGAD`: `18.4785, 73.8220`)
  - Pashan / Sus (`STN_PASHAN`: `18.5415, 73.7925`)
  - Lohegaon / Pune Airport (`STN_LOHEGAON`: `18.5821, 73.9197`)
  - Katraj (`STN_KATRAJ`: `18.4529, 73.8652`)
  - Hadapsar (`STN_HADAPSAR`: `18.5089, 73.9259`)
  - Pimpri-Chinchwad / Nigdi (`STN_PCMC`: `18.6298, 73.7997`)
- **Variables:** Past 24-hour observed hourly precipitation (`past_days=1`), current-hour precipitation, and next 24-hour forecast (`forecast_days=1`).
- **Cache & Freshness:** Cached in SQLite (`rainfall_cache` table) for 15 minutes. Every reading records `dataType` (`OBSERVED_RECENT`, `DELAYED`, `HISTORICAL`, or `UNAVAILABLE`) and timestamp.
- **IMD Status:** Direct India Meteorological Department (IMD) AWS telemetry requires an institutional `IMD_API_KEY`. When `IMD_API_KEY` is not configured, the API and UI explicitly report `imdApiStatus: "KEY_MISSING"` and do **not** fabricate IMD station readings.

---

## 2. Road Network Geometry & Graph
- **File:** `datasets/processed/roads.geojson` (synced to `src/data/roads.json` for ESM bundling)
- **Source:** OpenStreetMap (OSM) corridors & OSRM street-network routing geometry across Pune and Pimpri-Chinchwad.
- **Coverage:** **32 intersections/junctions (`RoadNode`)** and **46 directed corridor segments (`RoadSegment`)**, including:
  - Arterial highways, river bridges (Mula, Mutha, Pavana), causeways, and underpasses.
  - Attributes: `distanceKm`, `speedKmph`, `isOneWay`, `accessRestriction` (`all_vehicles`, `no_heavy_vehicles`, `emergency_only`), `isBridge`, `isTunnel`, `hasHistoricalFlood`, `waterwayProximity`.
- **Coordinate Snapping:** Arbitrary `(lat, lng)` GPS points or OpenStreetMap Nominatim geocoded addresses are snapped to the nearest road segment and intersection node (`snapCoordinateToRoadNetwork`). Haversine distance is used strictly for coordinate snapping, never as road travel distance.

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
