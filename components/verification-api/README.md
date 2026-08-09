# Verification API Gateway (`verification-api`)

The `verification-api` component is an Express.js API gateway that manages credential issuance, multi-database shard persistence, signature verification requests, and Hyperledger Fabric blockchain anchoring.

---

## 1. Purpose & Architecture

The gateway serves as the primary entry point for client applications requesting credential issuance or verification.

### Core Functions & Trust Boundaries
- **Shard Node Management**: Interacts with 5 isolated SQLite database instances (`node_1.db` through `node_5.db`). Each credential share is routed to its designated database instance without storing complete credential payloads in any single file.
- **Crypto Service Integration**: Communicates securely over HTTPS with the Python `crypto-service` to package and unpackage post-quantum signed credentials.
- **Blockchain Anchoring**: Uses `@hyperledger/fabric-gateway` over gRPC to anchor proof metadata (Credential ID, Data Hash, Issuer MSP, Timestamp) to `scatterid-channel` on Hyperledger Fabric.

### API Routes
- `POST /issue`: Accepts raw claim JSON, delegates packaging to `crypto-service`, writes 5 shares across `node_1.db`..`node_5.db`, and anchors the proof on Fabric.
- `POST /verify`: Fetches credential metadata and shares across SQLite nodes, validates SHA-256 checksums & SHA3-256 share hashes, queries Fabric anchor status, and delegates ML-DSA-65 signature verification to `crypto-service`.
- `GET /status/:id`: Returns credential state (`pending`, `anchored`, `failed`, `revoked`).

---

## 2. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP port on which the Express gateway listens. |
| `CRYPTO_SERVICE_URL` | Yes | `https://crypto-service:5001` | HTTPS URL of the backend Python crypto service. |
| `CRYPTO_SERVICE_API_KEY` | Yes | `dev-secret-key-123` | Bearer token secret sent in requests to `crypto-service`. |
| `NODE_EXTRA_CA_CERTS` | Yes | `/app/certs/crypto-service.crt` | Path to Root CA certificate for validating TLS connections to `crypto-service`. |

---

## 3. Pipelines & Execution

### Prerequisites
- Node.js v24+
- `libnode-dev` system package installed (required for dynamic C++ linking of `better-sqlite3`).
- Running `crypto-service` on port 5001 and running Hyperledger Fabric network on port 7051.

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start server in development mode:
```bash
npm run dev
```

### Container Build & Run

1. Build Docker image:
```bash
docker build -t scatterid-verification .
```

2. Run container:
```bash
docker run -d \
  --name scatterid-verification \
  -p 3000:3000 \
  -e CRYPTO_SERVICE_URL="https://crypto-service:5001" \
  -e CRYPTO_SERVICE_API_KEY="dev-secret-key-123" \
  -e NODE_EXTRA_CA_CERTS="/app/certs/crypto-service.crt" \
  -v $(pwd)/../crypto/certs:/app/certs \
  scatterid-verification
```

### Testing

Run automated tests:
```bash
npm test
```
