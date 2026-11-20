# SanketSetu — Smart Flood Risk Assessment & Emergency Safe-Route Management System

**SanketSetu** helps citizens and disaster response specialists identify flood-prone corridors, understand transparent flood risk, report waterlogging hazards, locate shelters and medical/animal rescue units, and compute safer emergency routes across **Pune and Pimpri-Chinchwad (PCMC), Maharashtra, India**.

---

## Architecture Overview

SanketSetu consolidates all flood-risk scoring, directed road-graph routing, authentication, and persistence into **one authoritative Node.js + Express + TypeScript backend** (`server.ts`, `src/utils/rules.ts`, `src/db/database.ts`), backed by persistent SQLite (`node:sqlite` at `./data/sanketsetu.db`) and a React + TypeScript + Leaflet PWA frontend.

- **Single Authoritative Engine**: Node.js + Express (`server.ts`) serves all REST APIs and executes the 5-factor flood-risk calculator and directed graph router (`src/utils/rules.ts`).
- **Strictly Two Roles (`CITIZEN` and `EXPERT`)**:
  - **Citizens** register/sign in directly, view gridded Open-Meteo precipitation estimates & road risk maps, calculate Shortest / Fastest / Safest routes with Yen alternatives, submit geo-tagged waterlogging reports (with optional photo upload), vote once per poll, inspect notifications, and access 24x7 SOS directories and multilingual voice/chat assistance.
  - **Experts** register with organisation/designation and remain `PENDING_APPROVAL` until approved by an existing active `EXPERT` (`PATCH /api/expert/applications/:id/approve`) or server bootstrap secret (`POST /api/expert/applications/:id/bootstrap-approve` with `EXPERT_APPROVAL_SECRET`). Verified experts control official road closures (with mandatory audit reason and expiry), verify/reject/resolve citizen reports, view persistent audit logs, and run non-mutating what-if rainfall simulations.
  - No separate Admin role or Admin UI exists.

---

## Core Capabilities

1. **Real Geospatial Road Network & Weather Telemetry**:
   - **69 Pune/PCMC Intersections** and **108 OSM/OSRM Road Corridors** (`src/data/roads.json`) with `isOneWay`, `accessRestriction`, bridge/tunnel metadata, and Copernicus DEM GLO-90 elevations.
   - **Open-Meteo Weather Service** (`src/services/weatherService.ts`) fetching past-24h model estimates, a current-hour estimate, and a 24h forecast across 9 Pune/PCMC grid points (~11 km resolution). These are not gauge observations; successful responses are cached in memory for 15 minutes.
   - **Honest Data Disclosure**: Reports `imdApiStatus: "KEY_MISSING"` when `IMD_API_KEY` is unconfigured and `capacityKnown: false` on drainage channels where quantitative stormwater capacities are unavailable. See [`DATA_SOURCES.md`](./DATA_SOURCES.md).

2. **Transparent Rule-Based Flood Risk & Safe-Route Engine (`src/utils/rules.ts`)**:
   - **5-Factor Linear Index**: $R = 0.30 F_{\text{rain}} + 0.20 F_{\text{terrain}} + 0.15 F_{\text{drainage}} + 0.15 F_{\text{historical}} + 0.20 F_{\text{community}}$ with precautionary non-zero missing-factor baselines, freshness weighting, contradiction flags, and `Unknown` classification when observational completeness is insufficient.
   - **Three Routing Objectives**:
     - `Shortest`: minimize network distance ($\text{km}$).
     - `Fastest`: minimize speed-adjusted travel time $T(e)$ ($\text{minutes}$).
     - `Safest`: minimize $C(e) = T(e) + \lambda \cdot R_{\text{time}}(e)$ ($\text{minutes}$), plus Yen's $K$-shortest loopless route alternatives and arbitrary coordinate road-snapping (`POST /api/routes/snap`).
   - Citizen reports mark corridors as `REPORTED_WATERLOGGING` (caution warning only) and never auto-close roads; only `EXPERT` verification can mark a road `CLOSED`.

3. **Security & Persistence**:
   - Per-user random-salted `scrypt` password hashing (`src/utils/auth.ts`) with `timingSafeEqual`.
   - HMAC-SHA256 signed tokens (`SESSION_SECRET`), rate limiting, origin CORS enforcement, and strict 2.5 MB PNG/JPEG/WEBP image upload validation.
   - SQLite schema (`database/schema.sql`) persisting users, expert applications, road overrides, verified hazards, reports, single-vote polls, trip feedback, notifications, rainfall cache, and audit logs.

4. **Accessibility, Multilingual Voice & Gemini Assistant**:
   - Full UI and speech support for **English (`en`)**, **Hindi (`hi-IN`)**, and **Marathi (`mr-IN`)**, including text-command fallback when browser microphone/Web Speech API is unavailable.
   - Server-side Gemini AI integration (`gemini-4-hydrogen` via `@google/genai`) with live backend function calling (`getRoadConditions`, `getLiveRainfall`, `getSafeRoute`, `getVerifiedReports`, `getEmergencyResources`) and an honest deterministic live-telemetry fallback if `GEMINI_API_KEY` is unconfigured.

---

## Setup & Running Locally

### Prerequisites
- Node.js **22.x** (built-in `node:sqlite`)

### Environment Variables
Copy `.env.example` to `.env` and set secrets for production deployments:
```bash
cp .env.example .env
```
Key variables: `HOST`, `PORT`, `NODE_ENV`, `DATABASE_URL`, `SESSION_SECRET`, `EXPERT_APPROVAL_SECRET`, `SEED_DEMO_ACCOUNTS`, `GEMINI_API_KEY`, `IMD_API_KEY`, `TOMTOM_API_KEY`.

TomTom status is based on successful recent flow responses. Each route calculation requests traffic for at most 12 candidate-road segments; other segments use estimated road-class speeds and are identified in the route response's data-quality warnings. The scheduled road-graph task refreshes the bundled OSM-derived snapshot locally and does not fetch Overpass data.

### Commands
```bash
# Install dependencies
npm install

# Run unit & API integration tests
npx tsx --test src/utils/auth.test.ts src/utils/rules.test.ts src/tests/api.test.ts

# Type-check & production build
npx tsc --noEmit
npm run build

# Start development server (Express + Vite on port 3000)
npm run dev
```

Open `http://localhost:3000` to use **SanketSetu**.
