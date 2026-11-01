-- FloodGuard PostgreSQL / SQLite Schema
-- Section 5 & 16 Database Architecture with User Authentication and Expert Approvals

CREATE TABLE IF NOT EXISTS roles (
    role_id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    full_name VARCHAR(128) NOT NULL,
    email VARCHAR(128) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(256) NOT NULL,
    role VARCHAR(32) DEFAULT 'CITIZEN', -- CITIZEN, EXPERT, ADMIN
    account_status VARCHAR(32) DEFAULT 'ACTIVE', -- ACTIVE, PENDING_APPROVAL, REJECTED, SUSPENDED
    organisation VARCHAR(128),
    designation VARCHAR(128),
    preferred_language VARCHAR(8) DEFAULT 'en',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expert_applications (
    application_id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id),
    full_name VARCHAR(128) NOT NULL,
    email VARCHAR(128) NOT NULL,
    organisation VARCHAR(128) NOT NULL,
    designation VARCHAR(128) NOT NULL,
    status VARCHAR(32) DEFAULT 'PENDING_APPROVAL',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS road_nodes (
    node_id VARCHAR(64) PRIMARY KEY,
    node_name VARCHAR(128) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    elevation_m DOUBLE PRECISION DEFAULT 560.0
);

CREATE TABLE IF NOT EXISTS roads (
    road_id VARCHAR(64) PRIMARY KEY,
    road_name VARCHAR(128) NOT NULL,
    from_node VARCHAR(64) REFERENCES road_nodes(node_id),
    to_node VARCHAR(64) REFERENCES road_nodes(node_id),
    road_type VARCHAR(32) NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    estimated_speed_kmph DOUBLE PRECISION NOT NULL,
    base_elevation_m DOUBLE PRECISION NOT NULL,
    slope_pct DOUBLE PRECISION NOT NULL,
    drainage_condition VARCHAR(32) DEFAULT 'good',
    accessibility VARCHAR(64) DEFAULT 'all_vehicles',
    is_one_way BOOLEAN DEFAULT FALSE,
    current_status VARCHAR(32) DEFAULT 'open',
    flood_risk_score DOUBLE PRECISION DEFAULT 0.0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rainfall_observations (
    observation_id VARCHAR(64) PRIMARY KEY,
    station_name VARCHAR(128) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    rainfall_mm DOUBLE PRECISION NOT NULL,
    rainfall_duration_hrs DOUBLE PRECISION NOT NULL,
    source VARCHAR(128) NOT NULL,
    observation_timestamp TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS shelters (
    shelter_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    capacity INT NOT NULL,
    current_occupancy INT NOT NULL,
    pet_friendly BOOLEAN DEFAULT FALSE,
    wheelchair_accessible BOOLEAN DEFAULT FALSE,
    contact_information VARCHAR(64),
    address TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emergency_facilities (
    facility_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    facility_type VARCHAR(64) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    contact_information VARCHAR(64),
    specialization TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_reports (
    report_id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id),
    road_id VARCHAR(64) REFERENCES roads(road_id),
    location_name VARCHAR(128),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    report_type VARCHAR(64) NOT NULL,
    description TEXT,
    severity VARCHAR(32) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verification_status VARCHAR(32) DEFAULT 'Reported',
    confidence_score DOUBLE PRECISION DEFAULT 0.5,
    reviewed_by VARCHAR(64),
    resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS route_feedback (
    feedback_id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id),
    route_id VARCHAR(64),
    route_name VARCHAR(128),
    reached_safely BOOLEAN NOT NULL,
    route_condition TEXT,
    water_level_category VARCHAR(64),
    travel_time_mins DOUBLE PRECISION,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verification_status VARCHAR(32) DEFAULT 'Verified'
);

CREATE TABLE IF NOT EXISTS live_polls (
    poll_id VARCHAR(64) PRIMARY KEY,
    road_id VARCHAR(64),
    road_name VARCHAR(128),
    question TEXT NOT NULL,
    options_json TEXT NOT NULL,
    votes_json TEXT NOT NULL,
    total_votes INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id VARCHAR(64) PRIMARY KEY,
    actor_id VARCHAR(64) NOT NULL,
    actor_name VARCHAR(128) NOT NULL,
    actor_role VARCHAR(32) NOT NULL,
    action VARCHAR(64) NOT NULL,
    target_resource VARCHAR(128) NOT NULL,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
