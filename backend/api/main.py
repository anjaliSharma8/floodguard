"""
FloodGuard FastAPI Application
Serves REST APIs for flood risk calculation, Dijkstra routing, community reports,
live polls, emergency resources, and authority incident management.
"""
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import json
import os

from backend.risk_engine.risk_calculator import calculate_flood_risk
from backend.routing.graph_router import PuneRoadGraph

app = FastAPI(
    title="FloodGuard API",
    description="AI-Powered Flood Risk Intelligence & Safe-Route Management API for Pune & PCMC",
    version="1.0.0"
)

graph = PuneRoadGraph()

class RiskCalculationRequest(BaseModel):
    rainfall_mm: float = Field(..., ge=0, le=500, description="Rainfall in millimeters")
    elevation_m: float = Field(560.0, description="Elevation in meters")
    slope_pct: float = Field(1.0, description="Terrain slope percentage")
    drainage_condition: str = Field("moderate", description="good, moderate, poor, clogged")
    has_historical_flood: bool = False
    community_risk_score: float = 0.0

class RouteFindRequest(BaseModel):
    start_node: str = Field(..., description="Starting road node, e.g. N_SHIVAJINAGAR")
    end_node: str = Field(..., description="Destination road node, e.g. N_SINHAGAD_RD")
    lambda_risk_weight: float = Field(1.5, ge=0.0, le=5.0, description="Preference penalty for avoiding high flood risk")

class CommunityReportSubmit(BaseModel):
    user_id: str
    road_id: Optional[str] = None
    location_name: str
    latitude: float
    longitude: float
    report_type: str
    description: str
    severity: str

class RoadStatusUpdate(BaseModel):
    status: str = Field(..., description="open, blocked, caution")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "FloodGuard API", "region": "Pune & PCMC, Maharashtra"}

@app.post("/risk/calculate")
def calculate_risk_endpoint(req: RiskCalculationRequest):
    result = calculate_flood_risk(
        rainfall_mm=req.rainfall_mm,
        elevation_m=req.elevation_m,
        slope_pct=req.slope_pct,
        drainage_condition=req.drainage_condition,
        has_historical_flood=req.has_historical_flood,
        community_risk_score=req.community_risk_score
    )
    return result

@app.post("/routes/find")
def find_safe_routes(req: RouteFindRequest):
    routes = graph.find_routes(req.start_node, req.end_node, req.lambda_risk_weight)
    return routes

@app.get("/map/roads")
def get_roads():
    return {"nodes": graph.nodes, "edges": graph.edges}

@app.patch("/roads/{road_id}/status")
def update_road_status(road_id: str, update: RoadStatusUpdate):
    for edge in graph.edges:
        if edge["id"] == road_id:
            edge["status"] = update.status
            return {"success": True, "road_id": road_id, "new_status": update.status}
    raise HTTPException(status_code=404, detail="Road segment not found")
