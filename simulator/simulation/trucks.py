from dataclasses import dataclass
from typing import List


IDLE = 'IDLE'
MOVING = 'MOVING'
STOPPED = 'STOPPED'
DELAYED = 'DELAYED'


@dataclass
class SimulatedTruck:
    truck_id: int
    route_polyline: List[dict]
    progress: float = 0.0
    current_speed_kph: float = 0.0
    current_lat: float | None = None
    current_lng: float | None = None
    heading_deg: float = 0.0
    gps_accuracy_m: float = 5.0
    state: str = IDLE
    route_distance_km: float = 0.0
    route_segments: List[dict] | None = None
    cruise_speed_kph: float = 0.0
    accel_kph_per_s: float = 0.0
    decel_kph_per_s: float = 0.0
    speed_factor: float = 1.0
    pause_until_ts: float = 0.0
    delayed_until_ts: float = 0.0
    comms_silence_until_ts: float = 0.0
    delay_reason: str | None = None
    reroute_count: int = 0
    breakdown_count: int = 0
    active: bool = True
