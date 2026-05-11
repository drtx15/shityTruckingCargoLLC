# Git-Based Droplet Deployment

This is the locked deployment plan for the current non-Kubernetes setup. No container registry is required. Each droplet clones the same Git repository, then runs only the service assigned to that droplet with Docker Compose.

## Locked Topology

| Droplet | Service | Public ports |
|---|---|---|
| `client-gateway` | React static app + nginx gateway/load balancer | `80`, later `443` |
| `api-1` | Fastify API | `3000` only from gateway |
| `api-2` | Fastify API | `3000` only from gateway |
| `worker-1` | Telemetry/background worker | none, optional `3001` health |
| `worker-2` | Telemetry/background worker | none, optional `3001` health |
| `simulator-provider` | Standalone telematics provider API | `8001` only from API/workers |
| `postgres` | Postgres + MinIO object storage containers | `5432` only from API/workers; `9000` from API/client-gateway; `9001` only from your IP |
| `redis-rabbitmq` | Redis + RabbitMQ containers | `6379`, `5672`; `15672` only from your IP |

Runtime flow:

```text
Browser
  -> client-gateway
      -> /api -> api-1/api-2
      -> /ws  -> api-1/api-2

api-1/api-2
  -> Postgres
  -> MinIO on postgres droplet for shared avatars/files
  -> Redis
  -> RabbitMQ
  -> simulator-provider when starting simulation

worker-1/worker-2
  -> simulator-provider polling GPS
  -> RabbitMQ telemetry queue
  -> Postgres updates
  -> Redis live snapshots and polling locks
```

Repository:

```bash
git clone https://github.com/drtx15/shityTruckingCargoLLC.git /opt/shitytruckingcargoll
```

Install Docker once on every droplet:

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl git ufw

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
```

Basic firewall shape:

```bash
ufw allow OpenSSH
# then add only the service ports needed for that droplet
ufw enable
```

## Postgres + Object Storage Droplet

Runs Postgres and MinIO in containers with persistent Docker volumes. MinIO is S3-compatible storage used for shared avatar/profile uploads across both API replicas.

```bash
git clone https://github.com/drtx15/shityTruckingCargoLLC.git /opt/shitytruckingcargoll
cd /opt/shitytruckingcargoll/infra/postgres
cp .env.example .env
nano .env
docker compose up -d
docker compose ps
```

Example `.env`:

```env
POSTGRES_DB=transit_grid
POSTGRES_USER=postgres
POSTGRES_PASSWORD=replace-with-strong-postgres-password
POSTGRES_PUBLIC_PORT=5432
MINIO_ROOT_USER=transitgrid
MINIO_ROOT_PASSWORD=replace-with-strong-minio-password
MINIO_BUCKET=transit-grid-uploads
MINIO_API_PUBLIC_PORT=9000
MINIO_CONSOLE_PUBLIC_PORT=9001
```

API and worker droplets will use:

```env
DATABASE_URL=postgresql://postgres:POSTGRES_PASSWORD@POSTGRES_DROPLET_IP:5432/transit_grid?schema=public
```

API droplets will use MinIO as object storage:

```env
OBJECT_STORAGE_ENDPOINT=http://POSTGRES_DROPLET_IP:9000
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_BUCKET=transit-grid-uploads
OBJECT_STORAGE_ACCESS_KEY_ID=transitgrid
OBJECT_STORAGE_SECRET_ACCESS_KEY=MINIO_ROOT_PASSWORD
OBJECT_STORAGE_PUBLIC_BASE_URL=http://CLIENT_GATEWAY_IP/storage
```

Open:

- `5432` only to `api-1`, `api-2`, `worker-1`, and `worker-2`.
- `9000` only to `api-1`, `api-2`, and `client-gateway`.
- `9001` only to your IP, or keep it closed.

Manual backup:

```bash
docker exec transit-grid-postgres pg_dump -U postgres transit_grid > /opt/shitytruckingcargoll/infra/postgres/backups/transit_grid_$(date +%F_%H%M).sql
```

## Redis + RabbitMQ Droplet

Runs Redis and RabbitMQ in containers with persistent Docker volumes.

```bash
git clone https://github.com/drtx15/shityTruckingCargoLLC.git /opt/shitytruckingcargoll
cd /opt/shitytruckingcargoll/infra/queue
cp .env.example .env
nano .env
docker compose up -d
docker compose ps
```

Example `.env`:

```env
REDIS_PASSWORD=replace-with-strong-redis-password
REDIS_PUBLIC_PORT=6379
RABBITMQ_DEFAULT_USER=transit
RABBITMQ_DEFAULT_PASS=replace-with-strong-rabbitmq-password
RABBITMQ_DEFAULT_VHOST=transit_grid
RABBITMQ_PUBLIC_PORT=5672
RABBITMQ_MANAGEMENT_PUBLIC_PORT=15672
```

API and worker droplets will use:

```env
REDIS_URL=redis://:REDIS_PASSWORD@QUEUE_DROPLET_IP:6379
RABBITMQ_URL=amqp://transit:RABBITMQ_DEFAULT_PASS@QUEUE_DROPLET_IP:5672/transit_grid
```

Open `6379` and `5672` only to `api-1`, `api-2`, `worker-1`, and `worker-2`. Open `15672` only to your IP, or keep it closed.

## API Droplet

Run this on both `api-1` and `api-2`. Both droplets use the same `.env`.

```bash
git clone https://github.com/drtx15/shityTruckingCargoLLC.git /opt/shitytruckingcargoll
cd /opt/shitytruckingcargoll/server
cp .env.example .env
nano .env
docker compose -f docker-compose.api.yml up -d --build api
docker compose -f docker-compose.api.yml ps
```

Run migrations once from `api-1` before starting or updating the API fleet:

```bash
docker compose -f docker-compose.api.yml --profile migrate run --rm migrate
```

Required `.env` values:

```env
DATABASE_URL=postgresql://postgres:POSTGRES_PASSWORD@POSTGRES_DROPLET_IP:5432/transit_grid?schema=public
REDIS_URL=redis://:REDIS_PASSWORD@QUEUE_DROPLET_IP:6379
RABBITMQ_URL=amqp://transit:RABBITMQ_DEFAULT_PASS@QUEUE_DROPLET_IP:5672/transit_grid
JWT_SECRET=replace-with-long-random-secret
CORS_ORIGIN=http://CLIENT_GATEWAY_IP
PUBLIC_BASE_URL=http://CLIENT_GATEWAY_IP
SIMULATOR_URL=http://SIMULATOR_DROPLET_IP:8001
TELEMATICS_PROVIDER_API_KEY=same-value-as-simulator-PROVIDER_API_KEY
```

Object storage is MinIO on the Postgres droplet:

```env
OBJECT_STORAGE_ENDPOINT=http://POSTGRES_DROPLET_IP:9000
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_BUCKET=transit-grid-uploads
OBJECT_STORAGE_ACCESS_KEY_ID=transitgrid
OBJECT_STORAGE_SECRET_ACCESS_KEY=MINIO_ROOT_PASSWORD
OBJECT_STORAGE_PUBLIC_BASE_URL=http://CLIENT_GATEWAY_IP/storage
```

Update:

```bash
cd /opt/shitytruckingcargoll
git pull
cd server
docker compose -f docker-compose.api.yml up -d --build api
```

During updates, run the migration command once from `api-1`, then rebuild/restart `api-1` and `api-2`.

## Worker Droplet

Run this on both `worker-1` and `worker-2`. Both droplets use the same `.env` as API, except `PORT` does not matter and `WORKER_HEALTH_PUBLIC_PORT` can differ if you expose it.

```bash
git clone https://github.com/drtx15/shityTruckingCargoLLC.git /opt/shitytruckingcargoll
cd /opt/shitytruckingcargoll/server
cp .env.example .env
nano .env
docker compose -f docker-compose.worker.yml up -d --build
docker compose -f docker-compose.worker.yml ps
```

Use the same `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `SIMULATOR_URL`, and `TELEMATICS_PROVIDER_API_KEY` as the API droplets. Multiple workers are expected; provider polling uses Redis lease/dedupe.

Update:

```bash
cd /opt/shitytruckingcargoll
git pull
cd server
docker compose -f docker-compose.worker.yml up -d --build
```

## Client Droplet

Runs the React static app and acts as the public nginx gateway/load balancer for both API droplets.

```bash
git clone https://github.com/drtx15/shityTruckingCargoLLC.git /opt/shitytruckingcargoll
cd /opt/shitytruckingcargoll/client
cp .env.droplet.example .env
nano .env
docker compose up -d --build
docker compose ps
```

Example `.env`:

```env
VITE_API_URL=/api
VITE_WS_URL=
API_UPSTREAM_1=API_1_DROPLET_IP:3000
API_UPSTREAM_2=API_2_DROPLET_IP:3000
STORAGE_UPSTREAM=POSTGRES_DROPLET_IP:9000
OBJECT_STORAGE_BUCKET=transit-grid-uploads
CLIENT_PORT=80
```

The browser talks only to the client gateway. The gateway proxies `/api`, `/ws`, `/docs`, `/metrics`, `/health`, and `/status` to `api-1`/`api-2`. It also proxies `/storage/...` to MinIO on the Postgres droplet.

Update:

```bash
cd /opt/shitytruckingcargoll
git pull
cd client
docker compose up -d --build
```

## Simulator Provider Droplet

Runs the standalone telematics-provider API. This provider does not know Transit Grid. Transit Grid knows and polls the provider.

```bash
git clone https://github.com/drtx15/shityTruckingCargoLLC.git /opt/shitytruckingcargoll
cd /opt/shitytruckingcargoll/simulator
cp .env.example .env
nano .env
docker compose up -d --build
docker compose ps
```

Example `.env`:

```env
PROVIDER_NAME=Transit Grid Telematics
PROVIDER_API_KEY=same-value-as-backend-TELEMATICS_PROVIDER_API_KEY
MAX_ROUTE_POINTS=250
LOCATION_EMIT_INTERVAL_SECONDS=1
```

## Notes

- API scaling: add another API droplet and add it to the client gateway upstream list.
- Worker scaling: add another worker droplet with the same `.env`.
- Database is the main future bottleneck. Back it up before every serious demo.
- Use firewall rules so public traffic reaches only the intended ports.
- For HTTPS later, put Caddy or nginx TLS in front of the client gateway and simulator provider.
