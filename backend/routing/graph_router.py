"""
FloodGuard Graph Routing Engine
Constructs graph G = (V, E) of Pune & PCMC road network.
Implements Dijkstra and A* pathfinding with configurable risk cost:
Cost(e) = T(e) + lambda_weight * R(e)
Excludes confirmed blocked roads and computes route comparison (Shortest vs Safest).
"""
import math
from typing import Dict, List, Optional, Tuple, Any

try:
    import networkx as nx
except ImportError:
    nx = None

# Fallback graph router if NetworkX is not installed
class PuneRoadGraph:
    def __init__(self):
        self.nodes = {
            "N_SHIVAJINAGAR": {"name": "Shivajinagar Junction", "lat": 18.5314, "lon": 73.8446, "elev_m": 560},
            "N_DECCAN": {"name": "Deccan Gymkhana (Goodluck Chowk)", "lat": 18.5186, "lon": 73.8378, "elev_m": 558},
            "N_SINHAGAD_RD": {"name": "Sinhagad Road (Anand Nagar)", "lat": 18.4980, "lon": 73.8210, "elev_m": 546},
            "N_KOTHRUD": {"name": "Kothrud (Chandani Chowk Road)", "lat": 18.5020, "lon": 73.8060, "elev_m": 572},
            "N_SWARGATE": {"name": "Swargate Jedhe Chowk", "lat": 18.5018, "lon": 73.8580, "elev_m": 559},
            "N_KATRAJ": {"name": "Katraj Chowk", "lat": 18.4520, "lon": 73.8520, "elev_m": 585},
            "N_BUND_GARDEN": {"name": "Bund Garden / Sangam Bridge", "lat": 18.5340, "lon": 73.8790, "elev_m": 551},
            "N_AIRPORT": {"name": "Lohegaon Airport Junction", "lat": 18.5822, "lon": 73.9197, "elev_m": 568},
            "N_AUNDH": {"name": "Aundh Parihar Chowk", "lat": 18.5620, "lon": 73.8050, "elev_m": 565},
            "N_WAKAD": {"name": "Wakad Bridge", "lat": 18.5980, "lon": 73.7650, "elev_m": 574},
            "N_HINJAWADI": {"name": "Hinjawadi IT Park Phase 1", "lat": 18.5890, "lon": 73.7180, "elev_m": 578},
            "N_PIMPRI": {"name": "Pimpri Chhatrapati Shivaji Chowk", "lat": 18.6279, "lon": 73.8131, "elev_m": 562},
            "N_CHINCHWAD": {"name": "Chinchwad Station Junction", "lat": 18.6420, "lon": 73.7850, "elev_m": 566}
        }
        self.edges = []
        self._build_default_edges()

    def _build_default_edges(self):
        # Road segments with distance (km), speed (kmph), flood risk score (0-100), status
        data = [
            ("R01", "N_SHIVAJINAGAR", "N_DECCAN", "FC Road", 1.8, 35, 42, "open"),
            ("R02", "N_SHIVAJINAGAR", "N_DECCAN", "JM Road", 1.9, 40, 28, "open"),
            ("R03", "N_DECCAN", "N_SINHAGAD_RD", "Sinhagad Road (Anand Nagar)", 3.8, 25, 88, "critical_waterlogged"),
            ("R04", "N_DECCAN", "N_KOTHRUD", "Karve Road", 3.2, 35, 18, "open"),
            ("R05", "N_KOTHRUD", "N_SINHAGAD_RD", "Warje Canal Bypass", 4.1, 30, 38, "open"),
            ("R06", "N_DECCAN", "N_SWARGATE", "Tilak Road", 2.4, 30, 45, "open"),
            ("R07", "N_SWARGATE", "N_KATRAJ", "Satara Road", 5.6, 45, 25, "open"),
            ("R08", "N_SHIVAJINAGAR", "N_BUND_GARDEN", "Pune Station - Bund Garden", 3.6, 35, 68, "open"),
            ("R09", "N_BUND_GARDEN", "N_AIRPORT", "Yerawada Airport Road", 6.8, 50, 22, "open"),
            ("R10", "N_SHIVAJINAGAR", "N_AUNDH", "Ganeshkhind Road", 4.5, 40, 20, "open"),
            ("R11", "N_AUNDH", "N_WAKAD", "Aundh-Baner-Wakad Highway", 5.8, 55, 14, "open"),
            ("R12", "N_WAKAD", "N_HINJAWADI", "Wakad to Hinjawadi Phase 1", 4.2, 45, 19, "open"),
            ("R13", "N_WAKAD", "N_PIMPRI", "Wakad-Pimple Saudagar-Pimpri", 5.4, 40, 48, "open"),
            ("R14", "N_PIMPRI", "N_CHINCHWAD", "Pimpri-Chinchwad Grade Separator", 3.1, 50, 26, "open"),
            ("R15", "N_SHIVAJINAGAR", "N_PIMPRI", "Old Pune-Mumbai Highway", 11.2, 55, 24, "open"),
            ("R16", "N_SINHAGAD_RD", "N_KATRAJ", "Sinhagad Rd - Katraj Bypass", 6.5, 40, 36, "open")
        ]
        for item in data:
            self.edges.append({
                "id": item[0],
                "from": item[1],
                "to": item[2],
                "name": item[3],
                "dist_km": item[4],
                "speed_kmph": item[5],
                "risk_score": item[6],
                "status": item[7]
            })

    def find_routes(self, start_node: str, end_node: str, lambda_risk: float = 1.0) -> Dict[str, Any]:
        """
        Calculates both the shortest route (pure time/distance) and the safest route
        (incorporating flood risk penalty: Cost = T(e) + lambda_risk * R(e)).
        Excludes verified blocked roads.
        """
        if start_node not in self.nodes or end_node not in self.nodes:
            return {"error": "Invalid start or destination node"}

        # Custom Dijkstra implementation
        shortest = self._dijkstra(start_node, end_node, weight_fn=lambda e: (e["dist_km"] / e["speed_kmph"]) * 60)
        safest = self._dijkstra(
            start_node, 
            end_node, 
            weight_fn=lambda e: ((e["dist_km"] / e["speed_kmph"]) * 60) + (lambda_risk * (e["risk_score"] / 100.0) * 30.0)
        )

        return {
            "origin": self.nodes[start_node],
            "destination": self.nodes[end_node],
            "shortest_route": shortest,
            "safest_route": safest,
            "lambda_risk_weight": lambda_risk
        }

    def _dijkstra(self, start: str, target: str, weight_fn) -> Dict[str, Any]:
        distances = {node: float("inf") for node in self.nodes}
        previous = {node: None for node in self.nodes}
        edge_used = {node: None for node in self.nodes}
        distances[start] = 0
        unvisited = set(self.nodes.keys())

        while unvisited:
            curr = min(unvisited, key=lambda node: distances[node])
            if distances[curr] == float("inf"):
                break
            if curr == target:
                break
            unvisited.remove(curr)

            # Check outbound & bidirectional edges
            for edge in self.edges:
                if edge["status"] == "blocked":
                    continue  # strictly avoid blocked roads

                neighbor = None
                if edge["from"] == curr:
                    neighbor = edge["to"]
                elif edge["to"] == curr:
                    neighbor = edge["from"]

                if neighbor and neighbor in unvisited:
                    cost = weight_fn(edge)
                    new_dist = distances[curr] + cost
                    if new_dist < distances[neighbor]:
                        distances[neighbor] = new_dist
                        previous[neighbor] = curr
                        edge_used[neighbor] = edge

        if distances[target] == float("inf"):
            return {
                "feasible": False,
                "message": "No feasible safe route found due to critical flood closures. Please seek nearest high-ground shelter.",
                "segments": []
            }

        # Reconstruct path
        path = []
        segments = []
        curr = target
        total_dist = 0.0
        total_time = 0.0
        risk_scores = []

        while curr != start:
            path.append(curr)
            e = edge_used[curr]
            if e:
                segments.append(e)
                total_dist += e["dist_km"]
                total_time += (e["dist_km"] / e["speed_kmph"]) * 60
                risk_scores.append(e["risk_score"])
            curr = previous[curr]
        path.append(start)
        path.reverse()
        segments.reverse()

        avg_risk = sum(risk_scores) / len(risk_scores) if risk_scores else 0
        max_risk = max(risk_scores) if risk_scores else 0

        return {
            "feasible": True,
            "nodes": path,
            "segments": segments,
            "total_distance_km": round(total_dist, 2),
            "estimated_travel_time_mins": round(total_time, 1),
            "average_risk_score": round(avg_risk, 1),
            "max_risk_score": round(max_risk, 1),
            "risk_level": "Low" if avg_risk < 30 else ("Moderate" if avg_risk < 60 else "High")
        }
