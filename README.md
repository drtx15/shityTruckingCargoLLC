# Distributed Logistics Shipment Tracking

This project simulates a distributed logistics platform with three independent components:

- Core backend API (Node.js + Fastify + Prisma + PostgreSQL)
- External simulator service (Python + FastAPI)
- Frontend UI (React + Vite + Leaflet)

## Architecture

- React UI talks only to Fastify backend.
- Fastify is the single source of truth for shipments, trucks, status, checkpoints, and ETA.
- FastAPI simulator stores no business data and only emits location updates.

Flow:

1. Create shipment in backend.
2. Assign truck in backend.
3. Backend asks simulator to start movement.
4. Simulator emits GPS updates to backend `/internal/location-update`.
5. Backend updates truck location, shipment status, checkpoints, ETA, and triggers webhooks.
6. Frontend polls backend tracking endpoint and renders map/timeline.

## Folder Layout

- client: React + Vite app
- server: Fastify + Prisma backend
- simulator: FastAPI simulation service

## Backend Endpoints

- POST /shipments (accepts coordinates or human-readable origin/destination text)
- GET /shipments
- GET /shipments/:id
- POST /shipments/:id/assign-truck
- GET /tracking/:id
- GET /locations/search?q=...&limit=5
- POST /internal/location-update
- GET /trucks
- POST /trucks
- POST /trucks/seed
- POST /auth/register
- POST /auth/login

## Simulator Endpoints

- GET /health
- GET /simulate/state
- POST /simulate/start

## Event Contract (Simulator -> Backend)

```json
{
  "truckId": 1,
  "lat": 41.3,
  "lng": 69.24,
  "speed": 42,
  "timestamp": 1710000000
}
```

## Environment Variables

### server/.env

- DATABASE_URL: PostgreSQL connection string
- JWT_SECRET: token secret
- PORT: backend port (default 3000)
- CORS_ORIGIN: frontend URL (default http://localhost:5173)
- SIMULATOR_URL: simulator base URL (example http://localhost:8001)
- WEBHOOK_URL: optional URL for status-change webhook callbacks
- NOMINATIM_BASE_URL: optional geocoding base URL (default https://nominatim.openstreetmap.org)
- NOMINATIM_USER_AGENT: optional User-Agent used for OpenStreetMap Nominatim requests

### simulator env

- BACKEND_URL: backend URL (default http://localhost:3000)

### client env (optional)

- VITE_API_URL: backend URL (default http://localhost:3000)

## Run Instructions

### Windows / PowerShell quick start

Run these from the workspace root: `D:\TL\IPproject\shityTruckingCargoLLC`.

1. Start PostgreSQL:

```powershell
docker compose up -d
```

2. Backend setup and start:

```powershell
Set-Location server
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run dev
```

3. Simulator setup and start:

```powershell
Set-Location ..\simulator
pip install -r requirements.txt
$env:BACKEND_URL = "http://localhost:3000"
uvicorn main:app --reload --port 8001
```

4. Frontend setup and start:

```powershell
Set-Location ..\client
npm install
npm run dev
```

### Notes

- PostgreSQL runs in the `transit-grid-postgres` container and exposes `localhost:5433` on the host.
- If you open a new terminal, repeat the `Set-Location` step before running commands in that component.
- If Prisma reports missing Shipment fields such as `originLabel`, `destinationLabel`, or `isPaused`, run `cd server` then `npm run prisma:generate` to refresh the generated client.
- To stop the database container, run `docker compose down` from the workspace root.

## Behavior Ownership

- Fastify decides shipment lifecycle and ETA.
- Fastify resolves place text (city/address/ZIP/state/country) into coordinates via OpenStreetMap Nominatim.
- FastAPI only emits movement telemetry.
- React only displays backend-provided state.
