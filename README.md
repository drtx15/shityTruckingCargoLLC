# Transit Grid Logistics Platform

Transit Grid is a distributed logistics and shipment-tracking system for the Database Application and Design Spring 2026 group project. It models shippers, shipments, trucks, checkpoints, ETA computation, webhook notifications, public tracking codes, live WebSocket tracking, streaming telemetry, Redis snapshots, and operational analytics.

## One-Command Run

```powershell
docker compose up -d --build
```

The gateway is the single public entrypoint:

- App: `http://localhost:8080`
- REST API through gateway: `http://localhost:8080/api`
- Swagger UI: `http://localhost:8080/docs`
- WebSocket tracking: `ws://localhost:8080/ws/tracking?trackingCode=TRK-2026-DEMO01`

The compose stack starts Nginx, React, two Fastify backend replicas, a telemetry worker, Python simulator, Postgres, Redis, RabbitMQ, OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana, and Promtail.

## Local Development

Backend:

```powershell
Set-Location server
npm install
npm run prisma:generate
npm run prisma:migrate -- --name local
npm run seed
npm run dev
```

Frontend:

```powershell
Set-Location client
npm install
npm run dev
```

Simulator:

```powershell
Set-Location simulator
pip install -r requirements.txt
$env:BACKEND_URL = "http://localhost:3000"
uvicorn main:app --reload --port 8001
```

## Environment Variables

Backend uses `server/.env.example` as the reference. Important variables:

- `DATABASE_URL`: Postgres connection string.
- `REDIS_URL`: Redis URL for tracking snapshots, pub/sub, geocoding cache, and token buckets.
- `RABBITMQ_URL`: RabbitMQ URL for telemetry streaming.
- `SIMULATOR_URL`: Python simulator base URL.
- `PUBLIC_BASE_URL`: public gateway URL used in generated links.
- `JWT_SECRET`: auth token signing secret.
- `RESEND_API_KEY`: Resend API key for passwordless email verification.
- `AUTH_FROM_EMAIL`: sender identity for verification codes, defaults to `Transit Grid <auth@drtx.tech>`.
- `AUTH_CODE_TTL_MINUTES`: one-time login code lifetime.
- `RATE_LIMIT_CAPACITY`, `RATE_LIMIT_REFILL_PER_MINUTE`: token bucket defaults.
- `DELAY_STOPPED_MINUTES`, `DELAY_ETA_GRACE_MINUTES`: delay detection controls.

Frontend uses:

- `VITE_API_URL`: REST API base URL. Defaults to `/api`, which is served by the Docker gateway.
- `VITE_WS_URL`: WebSocket base URL. Leave empty for same-origin `/ws` during local Vite development.
- `VITE_DEV_PROXY_TARGET`: Vite dev proxy target for `/api` and `/ws`; defaults to `http://127.0.0.1:8080`.

## Main Features

- Public tracking codes such as `TRK-2026-8F3K2A`.
- Shipper accounts with API key rotation.
- Shipment priority: `STANDARD`, `EXPRESS`, `URGENT`.
- Truck assignment rules based on idle state and capacity.
- Checkpoint timeline, ETA history, delay detection, and proof of delivery.
- Webhook subscriptions and delivery attempts with retry tracking.
- WebSocket live tracking for operator and public pages.
- Passwordless Resend login with role-based customer, driver, dispatcher, fleet, broker, and admin workspaces.
- Redis-backed active tracking snapshots.
- RabbitMQ telemetry stream with worker processing.
- From-scratch token-bucket rate limiter in `server/src/system-components/token-bucket.js`.

## Project Structure

- `client/`: React + Vite UI.
- `server/`: Fastify API, Prisma data layer, worker, Redis/RabbitMQ integrations.
- `simulator/`: FastAPI truck movement simulator.
- `infra/nginx/`: API gateway configuration.
- `infra/observability/`: Prometheus, Loki, Tempo, Grafana, Promtail, and OTel configs.
- `report/`: report source, diagrams, and BPMN documentation.
- `tools/`: project utility scripts such as tracking benchmarks.

## Change Guide

1. Update Prisma schema and add a migration for data-model changes.
2. Keep business rules in `server/src/services/`, not directly inside routes.
3. Add or update OpenAPI schemas when changing REST request/response shapes.
4. Add UI routes in `client/src/App.jsx` and page-level screens under `client/src/pages/`.
5. Keep generated artifacts, caches, logs, `node_modules`, virtual environments, and build outputs out of Git.

## Benchmark

After the stack is running and seeded:

```powershell
node tools\benchmark-tracking.mjs
```

Use `API_BASE_URL`, `SHIPMENT_ID`, and `ITERATIONS` to compare Postgres fallback vs Redis snapshot reads for the report.

## Release Notes

- `v1.0`: distributed logistics platform with REST, WebSocket tracking, Redis snapshots, RabbitMQ telemetry pipeline, webhook notifications, token-bucket rate limiting, analytics, Docker Compose orchestration, and observability scaffolding.

## Demo Role Accounts

When Resend is not configured locally, the login endpoint returns a development code in the UI after requesting a code. Seeded demo emails:

- `customer@drtx.tech`
- `driver@drtx.tech`
- `dispatcher@drtx.tech`
- `fleet@drtx.tech`
- `broker@drtx.tech`
- `admin@drtx.tech`
