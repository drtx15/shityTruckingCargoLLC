import random
import time
from threading import Lock, Thread

import requests

from config import (
    LOCATION_EMIT_INTERVAL_SECONDS,
    LOOP_TICK_SECONDS,
    MAX_ROUTE_POINTS,
)
from simulation.movement import (
    build_route_segments,
    heading_degrees,
    point_at_progress,
    route_distance_km,
    simplify_route_polyline,
    segment_at_progress,
)
from simulation.trucks import IDLE, MOVING, STOPPED, SimulatedTruck


class SimulationEngine:
    def __init__(self, backend_url: str):
        self.backend_url = backend_url.rstrip('/')
        self.trucks = {}
        self._lock = Lock()

    def start(self, truck: SimulatedTruck):
        truck.route_polyline = simplify_route_polyline(truck.route_polyline, MAX_ROUTE_POINTS)

        if not truck.route_polyline or len(truck.route_polyline) < 2:
            raise ValueError('Route polyline is required')

        route_distance = route_distance_km(truck.route_polyline)
        if route_distance <= 0:
            raise ValueError('Route distance must be greater than zero')

        route_segments = build_route_segments(truck.route_polyline)
        start_lat, start_lng = point_at_progress(truck.route_polyline, 0.0)

        truck.route_distance_km = route_distance
        truck.route_segments = route_segments
        truck.current_lat = start_lat
        truck.current_lng = start_lng
        truck.current_speed_kph = 0.0
        truck.state = MOVING
        truck.active = True
        truck.progress = 0.0

        # Profile per truck to avoid uniform convoy-like behavior.
        truck.cruise_speed_kph = random.uniform(58.0, 92.0)
        truck.accel_kph_per_s = random.uniform(6.0, 14.0)
        truck.decel_kph_per_s = random.uniform(8.0, 20.0)
        truck.next_location_emit_ts = 0.0
        truck.location_emit_interval_s = LOCATION_EMIT_INTERVAL_SECONDS

        with self._lock:
            existing = self.trucks.get(truck.truck_id)
            if existing:
                existing.active = False
            self.trucks[truck.truck_id] = truck

        self._emit_payload(truck, event_type='RESUMED', reason='SIMULATION_STARTED')

        thread = Thread(target=self._run_loop, args=(truck,), daemon=True)
        thread.start()

    def get_state(self):
        with self._lock:
            return {
                truck_id: {
                    'progress': truck.progress,
                    'speed': truck.current_speed_kph,
                    'state': truck.state,
                    'heading': truck.heading_deg,
                    'active': truck.active,
                }
                for truck_id, truck in self.trucks.items()
            }

    def _run_loop(self, truck: SimulatedTruck):
        while True:
            with self._lock:
                mapped = self.trucks.get(truck.truck_id)
                if mapped is not truck or not truck.active:
                    return

                target_speed = self._target_speed_kph(truck)
                truck.current_speed_kph = self._apply_accel_decel(
                    current=truck.current_speed_kph,
                    target=target_speed,
                    accel_per_s=truck.accel_kph_per_s,
                    decel_per_s=truck.decel_kph_per_s,
                    dt_seconds=LOOP_TICK_SECONDS,
                )

                substeps = max(1, min(3, int(truck.current_speed_kph / 30.0) + 1))
                progress_step = self._progress_step(truck, truck.current_speed_kph, dt_seconds=LOOP_TICK_SECONDS)
                progress_per_substep = progress_step / substeps if substeps > 0 else progress_step

            substep_delay = random.uniform(0.25, 0.5)
            for _ in range(substeps):
                with self._lock:
                    mapped = self.trucks.get(truck.truck_id)
                    if mapped is not truck or not truck.active:
                        return

                    truck.progress = min(1.0, truck.progress + progress_per_substep)
                    clean_lat, clean_lng = point_at_progress(truck.route_polyline, truck.progress)
                    segment = segment_at_progress(
                        truck.route_segments,
                        truck.route_distance_km,
                        truck.progress,
                    )
                    zone = segment['zone'] if segment else 'rural'

                    previous = {'lat': truck.current_lat or clean_lat, 'lng': truck.current_lng or clean_lng}
                    current = {'lat': clean_lat, 'lng': clean_lng}
                    truck.heading_deg = heading_degrees(previous, current)
                    noisy_lat, noisy_lng, accuracy = self._add_gps_noise(clean_lat, clean_lng, zone)
                    truck.current_lat = noisy_lat
                    truck.current_lng = noisy_lng
                    truck.gps_accuracy_m = accuracy

                    now = time.time()
                    should_emit_location = now >= truck.next_location_emit_ts
                    if should_emit_location:
                        truck.next_location_emit_ts = now + truck.location_emit_interval_s

                if should_emit_location:
                    self._emit_payload(truck, event_type='LOCATION_UPDATE')

                if truck.progress >= 1.0:
                    with self._lock:
                        truck.current_speed_kph = 0.0
                        truck.state = IDLE
                        truck.active = False
                    self._emit_payload(truck, event_type='STOPPED', reason='DESTINATION_REACHED')
                    return

                time.sleep(substep_delay)

    def _target_speed_kph(self, truck: SimulatedTruck):
        if truck.state == STOPPED:
            return 0.0

        segment = segment_at_progress(
            truck.route_segments,
            truck.route_distance_km,
            truck.progress,
        )
        zone = segment['zone'] if segment else 'rural'
        turn_angle = segment['turn_angle_deg'] if segment else 0.0

        speed = truck.cruise_speed_kph

        # Ramp up out of origin and down near destination for realistic profile.
        if truck.progress < 0.12:
            speed *= 0.32 + (truck.progress / 0.12) * 0.68
        elif truck.progress > 0.82:
            remaining = max(0.0, 1.0 - truck.progress)
            speed *= max(0.22, remaining / 0.18)

        if turn_angle > 35.0:
            speed *= 0.55
        elif turn_angle > 18.0:
            speed *= 0.75

        if zone == 'urban':
            speed *= random.uniform(0.55, 0.82)
        elif zone == 'highway':
            speed *= random.uniform(0.98, 1.12)
        else:
            speed *= random.uniform(0.75, 0.98)

        return max(0.0, min(120.0, speed))

    def _progress_step(self, truck: SimulatedTruck, speed_kph: float, dt_seconds: float):
        if truck.route_distance_km <= 0:
            return 1.0

        distance_step = speed_kph * (dt_seconds / 3600.0)
        return distance_step / truck.route_distance_km

    def _apply_accel_decel(
        self,
        current: float,
        target: float,
        accel_per_s: float,
        decel_per_s: float,
        dt_seconds: float,
    ):
        if target >= current:
            return min(target, current + accel_per_s * dt_seconds)
        return max(target, current - decel_per_s * dt_seconds)

    def _add_gps_noise(self, lat: float, lng: float, zone: str):
        jitter = random.uniform(0.0001, 0.0003)
        if zone == 'highway':
            jitter *= 0.7
            accuracy = random.uniform(4.0, 7.0)
        elif zone == 'urban':
            jitter *= 1.2
            accuracy = random.uniform(6.0, 12.0)
        else:
            accuracy = random.uniform(5.0, 9.0)

        noisy_lat = lat + random.uniform(-jitter, jitter)
        noisy_lng = lng + random.uniform(-jitter, jitter)
        return noisy_lat, noisy_lng, round(accuracy, 2)

    def _emit_payload(self, truck: SimulatedTruck, event_type: str, reason: str | None = None):
        payload = {
            'truckId': truck.truck_id,
            'lat': truck.current_lat,
            'lng': truck.current_lng,
            'speed': round(truck.current_speed_kph, 2),
            'heading': round(truck.heading_deg, 2),
            'accuracy': truck.gps_accuracy_m,
            'eventType': event_type,
            'state': truck.state,
            'timestamp': int(time.time()),
        }

        if reason:
            payload['reason'] = reason

        try:
            requests.post(
                f'{self.backend_url}/internal/location-update',
                json=payload,
                timeout=4,
            )
        except requests.RequestException:
            # The simulator should remain independent from transient backend issues.
            pass
