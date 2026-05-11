# Git-Based Droplet Deployment Runbook

This is the locked non-Kubernetes deployment plan. No container registry is required. Every droplet clones the same Git repository, then runs only its assigned Docker Compose file.

Use this file as a checklist. Do the sections in order.

## 0. Big Picture

| Droplet | Service | Compose path | Public ports |
|---|---|---|---|
| `postgres` | Postgres + MinIO object storage | `infra/postgres/docker-compose.yml` | `5432`, `9000`, optional `9001` |
| `redis-rabbitmq` | Redis + RabbitMQ | `infra/queue/docker-compose.yml` | `6379`, `5672`, optional `15672` |
| `simulator-provider` | Standalone telematics API | `simulator/docker-compose.yml` | `8001` |
| `api-1` | Fastify API replica 1 | `server/docker-compose.api.yml` | `3000` |
| `api-2` | Fastify API replica 2 | `server/docker-compose.api.yml` | `3000` |
| `worker-1` | Worker replica 1 | `server/docker-compose.worker.yml` | optional `3001` |
| `worker-2` | Worker replica 2 | `server/docker-compose.worker.yml` | optional `3001` |
| `client-gateway` | React app + nginx gateway | `client/docker-compose.yml` | `80`, later `443` |

Runtime flow:

```text
Browser
  -> client-gateway
      -> /api -> api-1/api-2
      -> /ws  -> api-1/api-2
      -> /storage -> MinIO on postgres droplet

api-1/api-2
  -> Postgres
  -> MinIO
  -> Redis
  -> RabbitMQ
  -> simulator-provider when starting simulation

worker-1/worker-2
  -> simulator-provider polling GPS
  -> RabbitMQ telemetry queue
  -> Postgres updates
  -> Redis live snapshots and polling locks
```

## 1. Deployment Checklist

Use this as the master checklist.

- [ ] Commit and push all local changes before touching droplets.
- [ ] Create all droplets.
- [ ] Fill the IP worksheet below.
- [ ] Install Docker on every droplet.
- [ ] Clone the repo on every droplet.
- [ ] Put the correct `.env` file on every droplet.
- [ ] Start `postgres` droplet.
- [ ] Start `redis-rabbitmq` droplet.
- [ ] Start `simulator-provider` droplet.
- [ ] Run DB migrations once from `api-1`.
- [ ] Start `api-1`.
- [ ] Start `api-2`.
- [ ] Start `worker-1`.
- [ ] Start `worker-2`.
- [ ] Start `client-gateway`.
- [ ] Run smoke tests from your local machine.
- [ ] Tighten firewall rules.

## 2. IP Worksheet

Fill this before editing `.env` files.

```text
CLIENT_GATEWAY_IP=
API_1_DROPLET_IP=
API_2_DROPLET_IP=
WORKER_1_DROPLET_IP=
WORKER_2_DROPLET_IP=
POSTGRES_DROPLET_IP=
QUEUE_DROPLET_IP=
SIMULATOR_DROPLET_IP=46.101.117.229
YOUR_HOME_IP=
```

Keep the generated secret values in local `.env` files. Do not commit them.

## 3. Before Droplets

Run this locally after code changes are ready:

```powershell
git status
git add .
git commit -m "Prepare git-based multi-droplet deployment"
git push
```

Check that real `.env` files are ignored:

```powershell
git check-ignore -v server\.env simulator\.env client\.env infra\postgres\.env infra\queue\.env
```

Expected: every file should be ignored.

## 4. Install Docker On Every Droplet

SSH into each droplet and run:

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

Clone the repo on every droplet:

```bash
git clone https://github.com/drtx15/shityTruckingCargoLLC.git /opt/shitytruckingcargoll
```

If the repo is already cloned:

```bash
cd /opt/shitytruckingcargoll
git pull
```

## 5. Prepare Env Files

You have two safe options.

Option A: edit `.env` directly on each droplet with `nano`.

Option B: edit locally, then copy with `scp`. This is easier after you replace IP placeholders.

PowerShell examples:

```powershell
scp -i C:\Users\itgro\.ssh\shitytruckingcargo_ed25519 infra\postgres\.env root@POSTGRES_DROPLET_IP:/opt/shitytruckingcargoll/infra/postgres/.env
scp -i C:\Users\itgro\.ssh\shitytruckingcargo_ed25519 infra\queue\.env root@QUEUE_DROPLET_IP:/opt/shitytruckingcargoll/infra/queue/.env
scp -i C:\Users\itgro\.ssh\shitytruckingcargo_ed25519 simulator\.env root@46.101.117.229:/opt/shitytruckingcargoll/simulator/.env
scp -i C:\Users\itgro\.ssh\shitytruckingcargo_ed25519 server\.env root@API_1_DROPLET_IP:/opt/shitytruckingcargoll/server/.env
scp -i C:\Users\itgro\.ssh\shitytruckingcargo_ed25519 server\.env root@API_2_DROPLET_IP:/opt/shitytruckingcargoll/server/.env
scp -i C:\Users\itgro\.ssh\shitytruckingcargo_ed25519 server\.env root@WORKER_1_DROPLET_IP:/opt/shitytruckingcargoll/server/.env
scp -i C:\Users\itgro\.ssh\shitytruckingcargo_ed25519 server\.env root@WORKER_2_DROPLET_IP:/opt/shitytruckingcargoll/server/.env
scp -i C:\Users\itgro\.ssh\shitytruckingcargo_ed25519 client\.env root@CLIENT_GATEWAY_IP:/opt/shitytruckingcargoll/client/.env
```

Before copying, replace these placeholders in local `.env` files:

```text
CLIENT_GATEWAY_IP
API_1_DROPLET_IP
API_2_DROPLET_IP
POSTGRES_DROPLET_IP
QUEUE_DROPLET_IP
```

The simulator IP is already known in the current plan:

```text
46.101.117.229
```

## 6. Start Postgres + MinIO Droplet

On `postgres` droplet:

```bash
cd /opt/shitytruckingcargoll/infra/postgres
docker compose up -d
docker compose ps
```

Smoke tests on the same droplet:

```bash
docker exec transit-grid-postgres pg_isready -U postgres -d transit_grid
curl -f http://127.0.0.1:9000/minio/health/live
```

Expected:

```text
accepting connections
HTTP 200 from MinIO health
```

Firewall after it works:

```bash
ufw allow OpenSSH
ufw allow from API_1_DROPLET_IP to any port 5432 proto tcp
ufw allow from API_2_DROPLET_IP to any port 5432 proto tcp
ufw allow from WORKER_1_DROPLET_IP to any port 5432 proto tcp
ufw allow from WORKER_2_DROPLET_IP to any port 5432 proto tcp
ufw allow from API_1_DROPLET_IP to any port 9000 proto tcp
ufw allow from API_2_DROPLET_IP to any port 9000 proto tcp
ufw allow from CLIENT_GATEWAY_IP to any port 9000 proto tcp
ufw allow from YOUR_HOME_IP to any port 9001 proto tcp
ufw enable
```

Hint: `9001` is only MinIO admin console. You can keep it closed.

Backup command:

```bash
mkdir -p /opt/shitytruckingcargoll/infra/postgres/backups
docker exec transit-grid-postgres pg_dump -U postgres transit_grid > /opt/shitytruckingcargoll/infra/postgres/backups/transit_grid_$(date +%F_%H%M).sql
```

## 7. Start Redis + RabbitMQ Droplet

On `redis-rabbitmq` droplet:

```bash
cd /opt/shitytruckingcargoll/infra/queue
docker compose up -d
docker compose ps
```

Smoke tests on the same droplet:

```bash
set -a
. ./.env
set +a
docker exec transit-grid-redis redis-cli -a "$REDIS_PASSWORD" ping
docker exec transit-grid-rabbitmq rabbitmq-diagnostics ping
```

Expected:

```text
PONG
Ping succeeded
```

Firewall after it works:

```bash
ufw allow OpenSSH
ufw allow from API_1_DROPLET_IP to any port 6379 proto tcp
ufw allow from API_2_DROPLET_IP to any port 6379 proto tcp
ufw allow from WORKER_1_DROPLET_IP to any port 6379 proto tcp
ufw allow from WORKER_2_DROPLET_IP to any port 6379 proto tcp
ufw allow from API_1_DROPLET_IP to any port 5672 proto tcp
ufw allow from API_2_DROPLET_IP to any port 5672 proto tcp
ufw allow from WORKER_1_DROPLET_IP to any port 5672 proto tcp
ufw allow from WORKER_2_DROPLET_IP to any port 5672 proto tcp
ufw allow from YOUR_HOME_IP to any port 15672 proto tcp
ufw enable
```

Hint: `15672` is RabbitMQ admin UI. You can keep it closed.

## 8. Start Simulator Provider Droplet

On `simulator-provider` droplet:

```bash
cd /opt/shitytruckingcargoll/simulator
docker compose up -d --build
docker compose ps
```

Smoke test from your local machine:

```powershell
Invoke-RestMethod http://46.101.117.229:8001/health
```

Smoke test protected endpoint:

```powershell
Invoke-RestMethod `
  -Uri http://46.101.117.229:8001/v1/provider
```

Firewall after it works:

```bash
ufw allow OpenSSH
ufw allow from API_1_DROPLET_IP to any port 8001 proto tcp
ufw allow from API_2_DROPLET_IP to any port 8001 proto tcp
ufw allow from WORKER_1_DROPLET_IP to any port 8001 proto tcp
ufw allow from WORKER_2_DROPLET_IP to any port 8001 proto tcp
ufw allow from YOUR_HOME_IP to any port 8001 proto tcp
ufw enable
```

## 9. Run Migrations Once From API-1

On `api-1` droplet:

```bash
cd /opt/shitytruckingcargoll/server
docker compose -f docker-compose.api.yml --profile migrate run --rm migrate
```

Expected: Prisma migration deploy completes without errors.

Important: do this once from `api-1`, not from both API droplets at the same time.

## 10. Start API-1 And API-2

On `api-1`:

```bash
cd /opt/shitytruckingcargoll/server
docker compose -f docker-compose.api.yml up -d --build api
docker compose -f docker-compose.api.yml ps
```

On `api-2`:

```bash
cd /opt/shitytruckingcargoll/server
docker compose -f docker-compose.api.yml up -d --build api
docker compose -f docker-compose.api.yml ps
```

Smoke tests from your local machine:

```powershell
Invoke-RestMethod http://API_1_DROPLET_IP:3000/health/ready
Invoke-RestMethod http://API_2_DROPLET_IP:3000/health/ready
```

Expected: both return healthy readiness JSON.

Firewall after it works:

```bash
ufw allow OpenSSH
ufw allow from CLIENT_GATEWAY_IP to any port 3000 proto tcp
ufw allow from YOUR_HOME_IP to any port 3000 proto tcp
ufw enable
```

Hint: after final demo setup, you can remove `YOUR_HOME_IP -> 3000` and access API only through gateway.

## 11. Start Worker-1 And Worker-2

On `worker-1`:

```bash
cd /opt/shitytruckingcargoll/server
docker compose -f docker-compose.worker.yml up -d --build
docker compose -f docker-compose.worker.yml ps
```

On `worker-2`:

```bash
cd /opt/shitytruckingcargoll/server
docker compose -f docker-compose.worker.yml up -d --build
docker compose -f docker-compose.worker.yml ps
```

Smoke tests from each worker droplet:

```bash
curl -f http://127.0.0.1:3001/health/ready
docker logs --tail 80 transit-grid-worker
```

Expected:

```text
health ready OK
Telemetry worker is consuming events
Telematics provider polling enabled
```

Note: two workers are safe. RabbitMQ distributes queue messages, and Redis lock/dedupe prevents duplicate provider polling ingestion.

## 12. Start Client Gateway

On `client-gateway` droplet:

```bash
cd /opt/shitytruckingcargoll/client
docker compose up -d --build
docker compose ps
```

Smoke tests from your local machine:

```powershell
Invoke-WebRequest http://CLIENT_GATEWAY_IP/
Invoke-RestMethod http://CLIENT_GATEWAY_IP/health/ready
```

Storage is best verified after uploading an avatar in the app, because MinIO may reject raw bucket listing even when file downloads work.

Open the app:

```text
http://CLIENT_GATEWAY_IP
```

## 13. Final End-To-End Smoke Test

Do this in the UI:

- [ ] Open `http://CLIENT_GATEWAY_IP`.
- [ ] Sign in or create an account.
- [ ] Upload an avatar.
- [ ] Refresh several times; avatar should still load.
- [ ] Create or open a shipment.
- [ ] Assign a truck.
- [ ] Check that simulator starts.
- [ ] Check that worker moves shipment from assigned to in transit.
- [ ] Check map/progress updates.

Useful URLs:

```text
http://CLIENT_GATEWAY_IP/health
http://CLIENT_GATEWAY_IP/status
http://CLIENT_GATEWAY_IP/docs
http://CLIENT_GATEWAY_IP/metrics
```

Useful logs:

```bash
docker logs --tail 100 transit-grid-api
docker logs --tail 100 transit-grid-worker
docker logs --tail 100 telematics-provider
docker logs --tail 100 transit-grid-postgres
docker logs --tail 100 transit-grid-minio
docker logs --tail 100 transit-grid-redis
docker logs --tail 100 transit-grid-rabbitmq
docker logs --tail 100 transit-grid-client
```

## 14. Update Procedure

For code updates:

```bash
cd /opt/shitytruckingcargoll
git pull
```

If Prisma migrations changed, run once on `api-1`:

```bash
cd /opt/shitytruckingcargoll/server
docker compose -f docker-compose.api.yml --profile migrate run --rm migrate
```

Restart changed services:

```bash
# API droplets
cd /opt/shitytruckingcargoll/server
docker compose -f docker-compose.api.yml up -d --build api

# Worker droplets
cd /opt/shitytruckingcargoll/server
docker compose -f docker-compose.worker.yml up -d --build

# Client gateway
cd /opt/shitytruckingcargoll/client
docker compose up -d --build

# Simulator provider
cd /opt/shitytruckingcargoll/simulator
docker compose up -d --build
```

Data services usually do not need rebuilds unless `infra/postgres` or `infra/queue` changed.

## 15. Troubleshooting

API cannot connect to Postgres:

```bash
docker logs --tail 100 transit-grid-api
```

Check `DATABASE_URL`, Postgres firewall, and `docker compose ps` on the Postgres droplet.

API cannot connect to Redis/RabbitMQ:

```bash
docker logs --tail 100 transit-grid-api
docker logs --tail 100 transit-grid-worker
```

Check `REDIS_URL`, `RABBITMQ_URL`, queue droplet firewall, and passwords.

App opens but API calls fail:

```bash
docker logs --tail 100 transit-grid-client
```

Check `API_UPSTREAM_1`, `API_UPSTREAM_2`, API health, and API firewalls.

WebSocket does not update:

Check that `/ws/` reaches API through client gateway and that Redis is available.

Shipments do not move:

Check worker logs:

```bash
docker logs --tail 100 transit-grid-worker
```

Look for:

```text
Telemetry worker is consuming events
Telematics provider polling enabled
```

Avatar upload works but image does not load:

Check these env values on API droplets:

```env
OBJECT_STORAGE_ENDPOINT=http://POSTGRES_DROPLET_IP:9000
OBJECT_STORAGE_PUBLIC_BASE_URL=http://CLIENT_GATEWAY_IP/storage
```

Check these env values on client gateway:

```env
STORAGE_UPSTREAM=POSTGRES_DROPLET_IP:9000
OBJECT_STORAGE_BUCKET=transit-grid-uploads
```

MinIO smoke test:

```bash
curl -f http://POSTGRES_DROPLET_IP:9000/minio/health/live
```

## 16. Scale Later

More API capacity:

- Create `api-3`.
- Copy `server/.env`.
- Run `server/docker-compose.api.yml`.
- Add `API_3_DROPLET_IP:3000` to nginx gateway template/config later.

More worker capacity:

- Create `worker-3`.
- Copy `server/.env`.
- Run `server/docker-compose.worker.yml`.

More simulator capacity:

- Add another simulator provider droplet later.
- Put a small nginx load balancer in front of providers.
- Change `SIMULATOR_URL` to provider gateway URL.

Main future bottleneck:

- Postgres droplet.
- Make backups before every serious demo.
