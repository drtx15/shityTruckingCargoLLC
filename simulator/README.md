# Simulator Service (FastAPI)

This service simulates truck movement and emits periodic GPS events to the core backend.

## Rules

- No database
- No shipment ownership
- No business-state decisions
- Only movement + location event emission

## Run

1. Create/activate Python environment.
2. Install packages:
   - `pip install -r requirements.txt`
3. Set backend URL (optional):
   - `set BACKEND_URL=http://localhost:3000`
4. Start:
   - `uvicorn main:app --reload --port 8001`

## Emitted payload

```json
{
  "truckId": 1,
  "lat": 41.3,
  "lng": 69.24,
  "speed": 42,
  "timestamp": 1710000000
}
```
