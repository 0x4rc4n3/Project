# Project Control Dashboard (`project-dashboard`)

The `project-dashboard` component is a developer control console and system health dashboard built with a strict Vercel/HashiCorp dark-mode aesthetic.

---

## 1. System Role & Features

- **Microservice Status Monitoring**: Uses low-latency TCP socket probing (`net.Socket`) to monitor health across ports `3000` (`verification-api`), `5001` (`crypto-service`), `7050` (Fabric Orderer), `7051` (Fabric Issuer Peer), and `8051` (Fabric Verifier Peer).
- **Interactive E2E Diagnostics**: Features a multi-step smoke tester that executes real-time credential issuance, sharding across isolated SQLite nodes, and post-quantum verification.
- **SQLite Database Explorer**: Provides real-time visibility into sharded credential tables (`credentials`, `shard_references`).
- **Markdown Progress Renderer**: Dynamically parses and renders master `Progress.md` context.

---

## 2. API Endpoints

- `GET /api/status`: Returns live operational status (`RUNNING` / `STOPPED` / `OFFLINE`) for microservices and Fabric nodes.
- `GET /api/credentials`: Queries local SQLite database records and returns JSON array of issued credentials and shard metadata.
- `POST /api/diagnostics/run`: Executes automated end-to-end issuance and verification diagnostic pipeline, returning step-by-step execution logs.
- `GET /api/progress`: Reads and returns `Progress.md` contents.

---

## 3. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP port for the Express dashboard server. |
| `VERIFICATION_API_URL` | `http://verification-api:3000` | Gateway URL for diagnostics smoke tests. |
| `CRYPTO_SERVICE_HOST` | `crypto-service` | Hostname for crypto service TCP port checks. |
| `VERIFICATION_API_HOST` | `verification-api` | Hostname for verification API TCP port checks. |

---

## 4. Execution

```bash
# Install dependencies
npm install

# Start local server
node server.js
```
Open `http://localhost:4000` in your web browser.
