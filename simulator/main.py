import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel

from config import MAX_ROUTE_POINTS, PROVIDER_API_KEY, PROVIDER_NAME, SIMULATOR_HOST, SIMULATOR_PORT
from simulation.engine import SimulationEngine
from simulation.movement import simplify_route_polyline
from simulation.trucks import SimulatedTruck


class RoutePoint(BaseModel):
    lat: float
    lng: float


class StartSimulationRequest(BaseModel):
    truckId: int
    shipmentId: int
    trackingCode: str | None = None
    routePolyline: list[RoutePoint]


class StartSimulationBatchRequest(BaseModel):
    simulations: list[StartSimulationRequest]


engine = SimulationEngine(provider_name=PROVIDER_NAME)

app = FastAPI(
    title='Telematics Provider Sandbox API',
    description='Standalone mock telematics provider for Transit Grid integrations.',
    version='1.0.0',
)


def require_provider_api_key(x_api_key: str = Header(default='')):
    if PROVIDER_API_KEY and x_api_key != PROVIDER_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid provider API key',
        )


def route_polyline_from_request(request: StartSimulationRequest):
    route_polyline = [{'lat': point.lat, 'lng': point.lng} for point in request.routePolyline]
    route_polyline = simplify_route_polyline(route_polyline, MAX_ROUTE_POINTS)

    if len(route_polyline) < 2:
        raise HTTPException(status_code=400, detail='routePolyline with at least two points is required')

    return route_polyline


@app.get('/health')
def health():
    return {
        'status': 'ok',
        'provider': PROVIDER_NAME,
    }


@app.get('/v1/provider')
def provider_metadata():
    return {
        'name': PROVIDER_NAME,
        'kind': 'telematics_provider',
        'capabilities': [
            'gps.location_polling',
            'route_based_simulation',
            'multi_vehicle_batch_start',
        ],
    }


@app.get('/v1/vehicles/locations', dependencies=[Depends(require_provider_api_key)])
def vehicle_locations():
    return {
        'provider': PROVIDER_NAME,
        'vehicles': engine.get_locations(),
    }


@app.post('/v1/simulations', dependencies=[Depends(require_provider_api_key)])
def start_simulation(request: StartSimulationRequest):
    route_polyline = route_polyline_from_request(request)

    truck = SimulatedTruck(
        truck_id=request.truckId,
        route_polyline=route_polyline,
    )
    engine.start(truck)
    return {
        'accepted': True,
        'provider': PROVIDER_NAME,
        'truckId': request.truckId,
        'shipmentId': request.shipmentId,
        'routePoints': len(route_polyline),
    }


@app.post('/v1/simulations/batch', dependencies=[Depends(require_provider_api_key)])
def start_simulation_many(request: StartSimulationBatchRequest):
    accepted = []

    for simulation in request.simulations:
        try:
            route_polyline = route_polyline_from_request(simulation)
        except HTTPException:
            continue

        truck = SimulatedTruck(
            truck_id=simulation.truckId,
            route_polyline=route_polyline,
        )
        engine.start(truck)
        accepted.append(simulation.truckId)

    return {
        'accepted': True,
        'provider': PROVIDER_NAME,
        'startedTruckIds': accepted,
        'requested': len(request.simulations),
        'started': len(accepted),
    }


@app.get('/simulate/state', dependencies=[Depends(require_provider_api_key)])
def simulation_state_legacy():
    return vehicle_locations()


@app.post('/simulate/start', dependencies=[Depends(require_provider_api_key)])
def start_simulation_legacy(request: StartSimulationRequest):
    return start_simulation(request)


@app.post('/simulate/start-many', dependencies=[Depends(require_provider_api_key)])
def start_simulation_many_legacy(request: StartSimulationBatchRequest):
    return start_simulation_many(request)


if __name__ == '__main__':
    uvicorn.run('main:app', host=SIMULATOR_HOST, port=SIMULATOR_PORT, reload=True)
