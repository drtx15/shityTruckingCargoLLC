import requests
from fastapi import FastAPI
from fastapi import HTTPException
from pydantic import BaseModel

from config import BACKEND_URL, MAX_ROUTE_POINTS
from simulation.engine import SimulationEngine
from simulation.movement import simplify_route_polyline
from simulation.trucks import SimulatedTruck


class StartSimulationRequest(BaseModel):
    truckId: int
    shipmentId: int


class StartSimulationBatchRequest(BaseModel):
    simulations: list[StartSimulationRequest]


engine = SimulationEngine(backend_url=BACKEND_URL)

app = FastAPI(title='Logistics Simulator Service')


@app.get('/health')
def health():
    return {'status': 'ok', 'backend': BACKEND_URL}


@app.get('/simulate/state')
def simulation_state():
    return engine.get_state()


@app.post('/simulate/start')
def start_simulation(request: StartSimulationRequest):
    route_response = requests.get(
        f'{BACKEND_URL}/shipments/{request.shipmentId}/route',
        timeout=4,
    )

    if route_response.status_code != 200:
        raise HTTPException(status_code=502, detail='Route unavailable from backend')

    route_polyline = simplify_route_polyline(route_response.json(), MAX_ROUTE_POINTS)

    truck = SimulatedTruck(
        truck_id=request.truckId,
        route_polyline=route_polyline,
    )
    engine.start(truck)
    return {'accepted': True, 'truckId': request.truckId}


@app.post('/simulate/start-many')
def start_simulation_many(request: StartSimulationBatchRequest):
    accepted = []

    for simulation in request.simulations:
        route_response = requests.get(
            f'{BACKEND_URL}/shipments/{simulation.shipmentId}/route',
            timeout=4,
        )

        if route_response.status_code != 200:
            continue

        route_polyline = simplify_route_polyline(route_response.json(), MAX_ROUTE_POINTS)
        truck = SimulatedTruck(
            truck_id=simulation.truckId,
            route_polyline=route_polyline,
        )
        engine.start(truck)
        accepted.append(simulation.truckId)

    return {
        'accepted': True,
        'startedTruckIds': accepted,
        'requested': len(request.simulations),
        'started': len(accepted),
    }
