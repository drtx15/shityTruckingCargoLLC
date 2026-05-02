import os

import requests
from fastapi import FastAPI
from fastapi import HTTPException
from pydantic import BaseModel

from simulation.engine import SimulationEngine
from simulation.trucks import SimulatedTruck


class StartSimulationRequest(BaseModel):
    truckId: int
    shipmentId: int


backend_url = os.getenv('BACKEND_URL', 'http://localhost:3000')
engine = SimulationEngine(backend_url=backend_url)

app = FastAPI(title='Logistics Simulator Service')


@app.get('/health')
def health():
    return {'status': 'ok', 'backend': backend_url}


@app.get('/simulate/state')
def simulation_state():
    return engine.get_state()


@app.post('/simulate/start')
def start_simulation(request: StartSimulationRequest):
    route_response = requests.get(
        f'{backend_url}/shipments/{request.shipmentId}/route',
        timeout=4,
    )

    if route_response.status_code != 200:
        raise HTTPException(status_code=502, detail='Route unavailable from backend')

    route_polyline = route_response.json()

    truck = SimulatedTruck(
        truck_id=request.truckId,
        route_polyline=route_polyline,
    )
    engine.start(truck)
    return {'accepted': True, 'truckId': request.truckId}
