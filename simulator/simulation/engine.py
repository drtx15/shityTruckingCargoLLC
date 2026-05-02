import random
import time
from threading import Lock, Thread

import requests

from simulation.movement import point_at_progress, route_distance_km
from simulation.trucks import SimulatedTruck


class SimulationEngine:
    def __init__(self, backend_url: str):
        self.backend_url = backend_url.rstrip('/')
        self.trucks = {}
        self._lock = Lock()

    def start(self, truck: SimulatedTruck):
        if not truck.route_polyline or len(truck.route_polyline) < 2:
            raise ValueError('Route polyline is required')

        with self._lock:
            self.trucks[truck.truck_id] = truck

        lat, lng = point_at_progress(truck.route_polyline, 0.0)
        with self._lock:
            truck.current_lat = lat
            truck.current_lng = lng

        thread = Thread(target=self._run_loop, args=(truck.truck_id,), daemon=True)
        thread.start()

    def get_state(self):
        with self._lock:
            return {
                truck_id: {
                    'progress': truck.progress,
                    'speed': truck.current_speed_kph,
                    'active': truck.active,
                }
                for truck_id, truck in self.trucks.items()
            }

    def _run_loop(self, truck_id: int):
        while True:
            with self._lock:
                truck = self.trucks.get(truck_id)
                if not truck or not truck.active:
                    return

            tick_seconds = random.uniform(1.0, 2.0)

            # Random short stop to emulate traffic or loading delay.
            should_stop = random.random() < 0.12
            speed = 0.0 if should_stop else random.uniform(25.0, 65.0)
            distance_km = route_distance_km(truck.route_polyline)

            if distance_km <= 0:
                progress_step = 1.0
            else:
                progress_step = (speed * (tick_seconds / 3600.0)) / distance_km

            with self._lock:
                truck.current_speed_kph = speed
                truck.progress = min(1.0, truck.progress + progress_step)
                lat, lng = point_at_progress(truck.route_polyline, truck.progress)
                truck.current_lat = lat
                truck.current_lng = lng

            payload = {
                'truckId': truck.truck_id,
                'lat': lat,
                'lng': lng,
                'speed': round(speed, 2),
                'timestamp': int(time.time()),
            }

            try:
                requests.post(
                    f'{self.backend_url}/internal/location-update',
                    json=payload,
                    timeout=4,
                )
            except requests.RequestException:
                # Simulator keeps running; backend is the owner of state and can recover.
                pass

            if truck.progress >= 1.0:
                with self._lock:
                    truck.active = False
                return

            time.sleep(tick_seconds)
