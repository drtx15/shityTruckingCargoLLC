from dataclasses import dataclass
from typing import List


@dataclass
class SimulatedTruck:
    truck_id: int
    route_polyline: List[dict]
    progress: float = 0.0
    current_speed_kph: float = 0.0
    current_lat: float | None = None
    current_lng: float | None = None
    active: bool = True
