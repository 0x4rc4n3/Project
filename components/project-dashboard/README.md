# Project Control Dashboard (`project-dashboard`)

The `project-dashboard` component is a developer control console and system health dashboard designed with a high-contrast dark-mode developer aesthetic inspired by Vercel and HashiCorp.

---

## 1. Purpose & Architecture

The dashboard gives operators and developers full visibility into the ScatterID microservices, storage shards, and cryptographic pipelines.

### Features
- **Real-Time Health Monitoring**: Polls status of `crypto-service` (HTTPS:5001), `verification-api` (HTTP:3000), `vault` (HTTP:8200), and Fabric nodes (ports 7050, 7051, 8051).
- **Multi-DB Shard Inspector**: Inspects SQLite credential records and shard tables across `node_1.db` through `node_5.db`.
- **E2E Diagnostic Smoke Tester**: Executes end-to-end issuance, sharding, anchoring, and verification flows with live terminal output.
- **Architecture Diagram Rendering**: Displays dynamic system architecture and trust boundary visualizations using Mermaid.js.

---

## 2. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4000` | HTTP port for the dashboard Express server. |
| `VERIFICATION_API_URL` | Yes | `http://verification-api:3000` | Internal network URL for the `verification-api` gateway. |
| `CRYPTO_SERVICE_URL` | No | `https://crypto-service:5001` | URL for direct crypto health checks. |
| `VAULT_ADDR` | No | `http://vault:8200` | URL for HashiCorp Vault health checks. |

---

## 3. Pipelines & Execution

### Local Development Setup

1. Install dependencies:
```bash
npm install
```

2. Run local dashboard server:
```bash
VERIFICATION_API_URL="http://localhost:3000" node server.js
```
Open `http://localhost:4000` in your web browser.

### Docker Container Build

1. Build Docker image:
```bash
docker build -t scatterid-dashboard .
```

2. Run container:
```bash
docker run -d \
  --name scatterid-dashboard \
  -p 4000:4000 \
  -e VERIFICATION_API_URL="http://verification-api:3000" \
  scatterid-dashboard
```
