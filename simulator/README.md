# Telematics Provider Sandbox API

This service is a standalone mock telematics provider, not part of the Transit Grid core app.
Think of it like a tiny Samsara/Motive-style API used for demos and integration testing.

## Responsibilities

- Expose a provider API for simulation control.
- Accept route geometry from Transit Grid when a simulation is started.
- Expose vehicle locations through provider API endpoints.
- Stay stateless and independently deployable.

## Security

- Public provider calls require `x-api-key: PROVIDER_API_KEY`.
- The provider never receives Transit Grid internal secrets.
- The provider never calls Transit Grid endpoints.

## Run locally

```powershell
cd simulator
Copy-Item .env.example .env
# edit PROVIDER_API_KEY
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

## Droplet setup

Current simulator droplet:

- Droplet name: `shitytruckingcargoll-simulator`
- Public IPv4: `46.101.117.229`
- SSH public key registered for the droplet: `C:\Users\itgro\.ssh\shitytruckingcargo_ed25519.pub`

Use the private key, not the `.pub` file, when connecting from PowerShell:

```powershell
ssh -i C:\Users\itgro\.ssh\shitytruckingcargo_ed25519 root@46.101.117.229
```

Initial Ubuntu hardening:

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl git ufw

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Install Docker:

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
```

Clone the project and create the provider environment:

```bash
git clone https://github.com/drtx15/shityTruckingCargoLLC.git /opt/shitytruckingcargoll
cd /opt/shitytruckingcargoll/simulator
cp .env.example .env
nano .env
```

Example `.env` for this standalone provider:

```env
PROVIDER_NAME=Transit Grid Telematics Sandbox
PROVIDER_API_KEY=replace-with-provider-control-key
MAX_ROUTE_POINTS=250
LOCATION_EMIT_INTERVAL_SECONDS=1
```

Meaning:

- `PROVIDER_API_KEY`: key that Transit Grid uses when it calls this provider API.
- Transit Grid polls `GET /v1/vehicles/locations` to ingest GPS events.

Run from git checkout with Docker Compose:

```bash
docker compose up -d --build
docker compose ps
```

Update from git:

```bash
cd /opt/shitytruckingcargoll
git pull
cd simulator
docker compose up -d --build
```

For a real public URL, put Caddy or nginx in front of port `8001` and expose only `80/443`. Direct `:8001` access is fine for a quick smoke test.

Transit Grid core must point to this provider:

```env
SIMULATOR_URL=http://46.101.117.229:8001
TELEMATICS_PROVIDER_API_KEY=same-value-as-provider-PROVIDER_API_KEY
```

Smoke test from your local PowerShell:

```powershell
Invoke-RestMethod http://46.101.117.229:8001/health
```

## API

Public:

- `GET /health`
- `GET /v1/provider`

Protected with `x-api-key`:

- `GET /v1/vehicles/locations`
- `POST /v1/simulations`
- `POST /v1/simulations/batch`

Legacy protected aliases are still available:

- `GET /simulate/state`
- `POST /simulate/start`
- `POST /simulate/start-many`

## Start one simulation

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:8001/v1/simulations `
  -Headers @{ "x-api-key" = "change-me-provider-api-key" } `
  -ContentType "application/json" `
  -Body '{ "truckId": 1, "shipmentId": 8, "routePolyline": [{ "lat": 41.31, "lng": 69.28 }, { "lat": 41.27, "lng": 69.21 }] }'
```

## Location payload returned by the provider

```json
{
  "provider": "Transit Grid Telematics Sandbox",
  "vehicles": [
    {
      "provider": "Transit Grid Telematics Sandbox",
      "providerEventId": "91a10f74-64d9-4470-9a48-8df9f2ff7335",
      "truckId": 1,
      "lat": 41.3,
      "lng": 69.24,
      "speed": 42,
      "heading": 120,
      "accuracy": 6.5,
      "eventType": "LOCATION_UPDATE",
      "state": "MOVING",
      "timestamp": 1710000000,
      "progress": 0.42,
      "active": true
    }
  ]
}
```
