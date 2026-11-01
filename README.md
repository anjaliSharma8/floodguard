# FloodGuard – AI-Powered Flood Risk Intelligence & Safe-Route System

FloodGuard is an AI-powered, community-driven flood risk intelligence and emergency safe-route management platform designed for citizens, emergency responders, and municipal disaster authorities in **Pune & Pimpri-Chinchwad, Maharashtra, India**.

---

## 🌟 Key Features

1. **Intelligent Safe-Route Management**:
   - Graph-based pathfinding using **Dijkstra's Algorithm** and **A\*** on the Pune & PCMC road network ($G = (V, E)$).
   - Dynamic flood penalty: $\text{Cost}(e) = T(e) + \lambda \times R(e)$, where $T(e)$ is travel time and $R(e)$ is flood risk penalty.
   - Compares **Fastest Route** vs **Safest Route** side-by-side with turn-by-turn flood warnings.
   - Strictly excludes confirmed blocked roads.

2. **Explainable Flood-Risk Engine**:
   - Transparent multi-factor formulation:
     $$\text{Risk Score} = (0.30 \times \text{Rainfall}) + (0.20 \times \text{Terrain}) + (0.15 \times \text{Drainage}) + (0.15 \times \text{Historical}) + (0.20 \times \text{Community})$$
   - Factors normalized on a 0–100 scale with full explainability statements.

3. **Community-Powered Intelligence**:
   - **Citizen Incident Reporting**: Submit waterlogging, submerged roads, fallen trees, or rescue requests with live status.
   - **Safe Route Feedback**: Citizens verify passability after completing journeys to calibrate graph cost functions.
   - **Public Live Polls**: Real-time road condition voting (e.g. Sinhagad Road, FC Road) with live percentage breakdowns.

4. **Authority & Disaster Command Desk**:
   - Live telemetry oversight (Rainfall at IMD Shivajinagar, Pashan, Lohegaon, Khadakwasla Dam).
   - Incident verification desk: Verify or reject crowdsourced reports.
   - Road status controller: Mark roads as officially blocked or reopened with immediate graph rerouting.
   - **Pre-Flood Simulation (What-If)**: Simulate 10mm to 150mm cloudburst events to view predictive inundation propagation.
   - **Post-Flood Damage Management**: Log infrastructure repairs and dispatch relief resources.

5. **Emergency Resources & Animal Rescue (Section 16)**:
   - Direct 1-click SOS fast dials (PMC Disaster: `+91-20-25501269`, Fire Brigade: `101`, Ambulance: `108`, NDRF: `1070`).
   - Verified 24x7 Animal Rescue lines: **RESQ Charitable Trust** (`+91-9890999111`), SPCA Pune, Bodhisattva.
   - Shelter finder with **Pet-Friendly** and **Wheelchair Accessible** filters.

6. **Accessibility & Multilingual Voice Assistant**:
   - Full support for **English**, **Hindi (हिन्दी)**, and **Marathi (मराठी)**.
   - Web Speech API integration for voice-driven destination searching and spoken turn-by-turn guidance.

7. **AI Emergency Chatbot & Offline Mode**:
   - Gemini AI integration with deterministic RAG fallback grounded in verified Pune flood datasets.
   - PWA Service Worker caching for offline emergency routing and survival guides.

---

## 🗂️ Dataset Architecture (Section 3)

```
FloodGuard/
├── datasets/
│   ├── raw/                  # Schema documentation for raw ingestion
│   ├── processed/
│   │   ├── rainfall.csv            # IMD & CWC station telemetry
│   │   ├── roads.geojson           # OSM Pune vector road network
│   │   ├── terrain.csv             # NASA SRTM 30m elevation & slopes
│   │   ├── drainage.csv            # PMC municipal drainage audits
│   │   ├── historical_floods.csv   # Documented 2019, 2021, 2023 flood events
│   │   ├── shelters.csv            # Emergency flood relief centres
│   │   ├── hospitals.csv           # Tertiary hospitals & ICU units
│   │   └── emergency_facilities.csv# Fire stations, NDRF & animal rescue
│   ├── community/
│   │   ├── community_reports.csv   # Citizen submitted hazards
│   │   ├── route_feedback.csv      # Trip feedback & passability
│   │   └── live_polls.csv          # Real-time community consensus
│   └── synthetic/
│       └── synthetic_demo_data.csv # Synthetic scenario test sets (labeled)
```

---

## 🚀 Running the Application

### Prerequisites
- Node.js 18+ (Node 20+ recommended)
- Python 3.10+ (for optional Python backend tools)

### Installation
```bash
# Install dependencies
npm install

# Run unit tests (Dijkstra, risk scoring, poll breakdowns)
npx tsx --test src/utils/rules.test.ts

# Start the full-stack server (runs on port 3000)
npm run dev
```

Visit `http://localhost:3000` to interact with FloodGuard.
