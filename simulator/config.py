import os

from dotenv import load_dotenv


load_dotenv()


def _read_float(name: str, fallback: float) -> float:
    try:
        return float(os.getenv(name, ''))
    except (TypeError, ValueError):
        return fallback


def _read_int(name: str, fallback: int) -> int:
    try:
        return int(os.getenv(name, ''))
    except (TypeError, ValueError):
        return fallback


PROVIDER_NAME = os.getenv('PROVIDER_NAME', 'Transit Grid Telematics Sandbox')
PROVIDER_API_KEY = os.getenv('PROVIDER_API_KEY', '')
SIMULATOR_HOST = os.getenv('SIMULATOR_HOST', '0.0.0.0')
SIMULATOR_PORT = _read_int('SIMULATOR_PORT', 8001)
MAX_ROUTE_POINTS = _read_int('MAX_ROUTE_POINTS', 0)
LOOP_TICK_SECONDS = _read_float('LOOP_TICK_SECONDS', 1.0)
LOCATION_EMIT_INTERVAL_SECONDS = _read_float('LOCATION_EMIT_INTERVAL_SECONDS', 1.0)
TRAFFIC_STOP_PROBABILITY = _read_float('TRAFFIC_STOP_PROBABILITY', 0.018)
TRAFFIC_DELAY_PROBABILITY = _read_float('TRAFFIC_DELAY_PROBABILITY', 0.03)
BREAKDOWN_PROBABILITY = _read_float('BREAKDOWN_PROBABILITY', 0.004)
COMMUNICATION_LOSS_PROBABILITY = _read_float('COMMUNICATION_LOSS_PROBABILITY', 0.01)
REROUTE_PROBABILITY = _read_float('REROUTE_PROBABILITY', 0.005)
