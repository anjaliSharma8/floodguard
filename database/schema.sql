-- SanketSetu Authoritative Relational Database Schema (SQLite / PostgreSQL compatible)
-- Strictly TWO application roles: CITIZEN and EXPERT (Zero ADMIN role)

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'CITIZEN' CHECK (role IN ('CITIZEN', 'EXPERT')),
    account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'PENDING_APPROVAL', 'REJECTED', 'SUSPENDED')),
    organisation TEXT,
    designation TEXT,
    preferred_language TEXT DEFAULT 'en',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expert_applications (
    application_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    organisation TEXT NOT NULL,
    designation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('ACTIVE', 'PENDING_APPROVAL', 'REJECTED', 'SUSPENDED')),
    applied_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT
);

CREATE TABLE IF NOT EXISTS road_segments (
    road_id TEXT PRIMARY KEY,
    road_name TEXT NOT NULL,
    from_node TEXT NOT NULL,
    to_node TEXT NOT NULL,
    road_type TEXT NOT NULL,
    distance_km REAL NOT NULL,
    speed_kmph REAL NOT NULL,
    base_elevation_m REAL,
    slope_pct REAL,
    drainage_condition TEXT DEFAULT 'moderate',
    is_one_way INTEGER DEFAULT 0,
    access_restriction TEXT DEFAULT 'all_vehicles',
    is_bridge INTEGER DEFAULT 0,
    is_tunnel INTEGER DEFAULT 0,
    surface TEXT DEFAULT 'asphalt',
    has_historical_flood INTEGER DEFAULT 0,
    waterway_proximity TEXT,
    risk_score REAL,
    risk_category TEXT NOT NULL DEFAULT 'Low',
    confidence_score REAL NOT NULL DEFAULT 0.8,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REPORTED_WATERLOGGING', 'VERIFIED_HAZARD', 'CLOSED', 'UNKNOWN')),
    coordinates_json TEXT NOT NULL,
    geometry_source TEXT,
    verified_by TEXT,
    status_reason TEXT,
    expires_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS road_updates (
    update_id TEXT PRIMARY KEY,
    road_id TEXT NOT NULL REFERENCES road_segments(road_id),
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    previous_risk REAL,
    new_risk REAL,
    reason TEXT NOT NULL,
    expires_at TEXT,
    updated_by_id TEXT NOT NULL,
    updated_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_reports (
    report_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT,
    road_id TEXT,
    location_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    report_type TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL,
    image_url TEXT,
    verification_status TEXT NOT NULL DEFAULT 'Reported' CHECK (verification_status IN ('Reported', 'Under Review', 'Verified', 'Rejected', 'Resolved')),
    confidence_score REAL NOT NULL DEFAULT 0.65,
    reviewed_by TEXT,
    review_notes TEXT,
    reviewed_at TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verified_hazards (
    hazard_id TEXT PRIMARY KEY,
    report_id TEXT,
    road_id TEXT NOT NULL,
    hazard_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT NOT NULL,
    verified_by_id TEXT NOT NULL,
    verified_by_name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shelters (
    shelter_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    capacity INTEGER NOT NULL,
    current_occupancy INTEGER NOT NULL,
    pet_friendly INTEGER NOT NULL DEFAULT 0,
    wheelchair_accessible INTEGER NOT NULL DEFAULT 0,
    contact TEXT NOT NULL,
    address TEXT NOT NULL,
    last_updated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS route_feedback (
    feedback_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT,
    route_name TEXT NOT NULL,
    reached_safely INTEGER NOT NULL,
    route_condition TEXT NOT NULL,
    water_level_category TEXT NOT NULL,
    travel_time_mins REAL NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS live_polls (
    poll_id TEXT PRIMARY KEY,
    road_id TEXT NOT NULL,
    road_name TEXT NOT NULL,
    question TEXT NOT NULL,
    options_json TEXT NOT NULL,
    votes_json TEXT NOT NULL,
    total_votes INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id TEXT NOT NULL REFERENCES live_polls(poll_id),
    user_id TEXT NOT NULL,
    selected_option TEXT NOT NULL,
    voted_at TEXT NOT NULL,
    PRIMARY KEY (poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id TEXT PRIMARY KEY,
    user_id TEXT, -- NULL means broadcast to all citizens
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    related_road_id TEXT,
    related_report_id TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rainfall_cache (
    station_id TEXT PRIMARY KEY,
    station_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    observed_past_24h_mm REAL,
    current_hour_mm REAL,
    forecast_next_24h_mm REAL,
    duration_hrs REAL NOT NULL DEFAULT 24,
    source TEXT NOT NULL,
    resolution TEXT NOT NULL,
    data_type TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    is_available INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL CHECK (actor_role IN ('CITIZEN', 'EXPERT')),
    action TEXT NOT NULL,
    target_resource TEXT NOT NULL,
    details TEXT NOT NULL,
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_road ON community_reports(road_id);
CREATE INDEX IF NOT EXISTS idx_reports_user ON community_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_road_updates_road ON road_updates(road_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
