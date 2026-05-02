# Simulator Service (FastAPI)

This service simulates truck movement and emits periodic GPS events to the core backend.

## Highlights

- Speed profile per truck: acceleration, cruising, and deceleration
- Segment-aware movement: slows down on dense turns, faster on straights
- Smooth interpolation: emits sub-steps instead of point-to-point jumps
- State machine: `IDLE`, `MOVING`, `STOPPED`, `DELAYED`
- Traffic and failure events: random delays, stops, breakdowns, communication loss, reroute
- Multi-truck stress mode via batch start endpoint

## Rules

- No database
- No shipment ownership
- No business-state decisions
- Only movement + location event emission

## Run

1. Create/activate Python environment.
2. Install packages:
   - `pip install -r requirements.txt`
3. Create or edit `simulator/.env` from `simulator/.env.example`.
4. Start:
   - `uvicorn main:app --reload --port 8001`

## Emitted payload

```json
{
  "truckId": 1,
  "lat": 41.3,
  "lng": 69.24,
  "speed": 42,
   "heading": 120,
   "accuracy": 6.5,
   "eventType": "LOCATION_UPDATE",
   "state": "MOVING",
   "reason": "TRAFFIC_JAM",
  "timestamp": 1710000000
}
```

## Start Endpoints

- `POST /simulate/start`
   - Body: `{ "truckId": 1, "shipmentId": 8 }`
- `POST /simulate/start-many`
   - Body: `{ "simulations": [{ "truckId": 1, "shipmentId": 8 }, { "truckId": 2, "shipmentId": 9 }] }`
