"""
FloodGuard Risk Prediction Engine
Implements explainable rule-based risk calculation:
Risk Score = (W1 * Rainfall) + (W2 * Terrain) + (W3 * Drainage) + (W4 * Historical) + (W5 * Community)
With normalized factor scores (0-100) and configurable weights.
"""
from typing import Dict, Any, Optional

DEFAULT_WEIGHTS = {
    "rainfall": 0.30,
    "terrain": 0.20,
    "drainage": 0.15,
    "historical": 0.15,
    "community": 0.20
}

def calculate_rainfall_factor(rainfall_mm: float, duration_hrs: float = 3.0) -> float:
    """Normalize rainfall intensity to 0-100 scale based on IMD heavy rainfall thresholds."""
    intensity = rainfall_mm / max(duration_hrs, 1.0)
    # IMD criteria: >15mm/hr is heavy, >30mm/hr is very heavy, >50mm/hr is extremely heavy
    if intensity >= 40:
        return 100.0
    elif intensity >= 25:
        return 75.0 + ((intensity - 25) / 15.0) * 25.0
    elif intensity >= 10:
        return 40.0 + ((intensity - 10) / 15.0) * 35.0
    else:
        return (intensity / 10.0) * 40.0

def calculate_terrain_factor(elevation_m: float, slope_pct: float) -> float:
    """Lower elevations and flatter terrain have higher waterlogging vulnerability."""
    # Pune base elevation approx 540m (riverbed) to 630m (hills)
    elev_score = max(0.0, min(100.0, (590.0 - elevation_m) * 2.0))
    # Flatter terrain (low slope < 1%) traps water
    slope_penalty = 30.0 if slope_pct < 1.0 else (15.0 if slope_pct < 2.0 else 0.0)
    return max(0.0, min(100.0, elev_score * 0.7 + slope_penalty))

def calculate_drainage_factor(condition: str) -> float:
    """Drainage maintenance status penalty."""
    mapping = {
        "poor": 90.0,
        "clogged": 85.0,
        "moderate": 45.0,
        "good": 15.0,
        "excellent": 5.0
    }
    return mapping.get(condition.lower(), 50.0)

def calculate_flood_risk(
    rainfall_mm: float,
    elevation_m: float,
    slope_pct: float,
    drainage_condition: str,
    has_historical_flood: bool,
    community_risk_score: float = 0.0,
    weights: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    w = weights or DEFAULT_WEIGHTS
    
    r_factor = calculate_rainfall_factor(rainfall_mm)
    t_factor = calculate_terrain_factor(elevation_m, slope_pct)
    d_factor = calculate_drainage_factor(drainage_condition)
    h_factor = 85.0 if has_historical_flood else 15.0
    c_factor = max(0.0, min(100.0, community_risk_score))
    
    total_score = (
        w["rainfall"] * r_factor +
        w["terrain"] * t_factor +
        w["drainage"] * d_factor +
        w["historical"] * h_factor +
        w["community"] * c_factor
    )
    total_score = round(max(0.0, min(100.0, total_score)), 1)
    
    # Categorize
    if total_score <= 20:
        category = "Very Low"
        color = "green"
    elif total_score <= 40:
        category = "Low"
        color = "lightgreen"
    elif total_score <= 60:
        category = "Moderate"
        color = "yellow"
    elif total_score <= 80:
        category = "High"
        color = "orange"
    else:
        category = "Critical"
        color = "red"
        
    return {
        "risk_score": total_score,
        "category": category,
        "color": color,
        "factors": {
            "rainfall_risk": round(r_factor, 1),
            "terrain_risk": round(t_factor, 1),
            "drainage_risk": round(d_factor, 1),
            "historical_risk": round(h_factor, 1),
            "community_risk": round(c_factor, 1)
        },
        "weights": w,
        "explainability": f"Score {total_score} computed via rainfall ({r_factor:.0f}%), elevation {elevation_m}m ({t_factor:.0f}%), drainage ({d_factor:.0f}%), historical evidence ({h_factor:.0f}%), and verified citizen reports ({c_factor:.0f}%)."
    }
