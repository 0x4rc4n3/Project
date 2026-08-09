# Verification API Gateway (`verification-api`)

The `verification-api` microservice is an Express.js ES-Module API gateway responsible for credential issuance, multi-database shard distribution across isolated SQLite instances, cryptographic validation, and Hyperledger Fabric blockchain proof anchoring.

---

## 1. System Role & Multi-Database Architecture

The gateway enforces zero-trust data segregation across physical database boundaries:

- **Isolated Multi-Database Sharding**: Maintains 5 independent SQLite database instances (`node_1.db` through `node_5.db`). No single database node ever contains $>1/n$ secret shares or usable credential payloads.
- **Statement Pre-compilation (Crash Prevention)**: All SQL queries (`INSERT`, `SELECT`, `UPDATE`) are pre-compiled once per database instance at startup into statement objects (`stmts`), preventing V8 garbage collection assertion crashes (`RemoveEnvironmentCleanupHook`) in Node.js 24.
- **Hyperledger Fabric gRPC Client**: Interacts with `scatterid-channel` and `scatterproof` Go chaincode using `@hyperledger/fabric-gateway` and `@grpc/grpc-js` over TLS.

---

## 2. API Endpoints & Request Lifecycles

### `POST /issue`
Accepts raw claim JSON, delegates cryptographic packaging to `crypto-service:5001`, writes shares 1..5 across `node_1.db`..`node_5.db`, and submits proof anchor transaction to Fabric ledger.

#### Request Body
```json
{
  "claim": {
    "subject": "did:scatterid:user-001",
    "degree": "BSc Computer Science"
  }
}
```

#### Response Body (`201 Created`)
```json
{
  "status": "anchored",
  "credentialId": "4b06b3cf-ce45-4e94-99ae-ad0088ce1b3f",
  "anchorTxId": "a7b8c9d0..."
}
```

---

### `POST /verify`
Performs reconstruction-less credential verification:
1. Queries Hyperledger Fabric ledger (`QueryProof`) to verify anchor existence and active status.
2. Fetches stored shares from `node_1.db` through `node_5.db`.
3. Validates Layer 1 SHA-256 appended share checksums and Layer 2 SHA3-256 database share hashes.
4. Passes valid share subset ($\ge 3$) to `crypto-service:5001/unpackage` for ML-DSA-65 signature verification.

#### Request Body
```json
{
  "credentialId": "4b06b3cf-ce45-4e94-99ae-ad0088ce1b3f"
}
```

#### Response Body (`200 OK`)
```json
{
  "valid": true,
  "anchorStatus": "active",
  "issuedAt": "2026-08-09T10:47:55.456699+00:00"
}
```

---

## 3. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port for gateway server. |
| `CRYPTO_SERVICE_URL` | `https://crypto-service:5001` | Internal HTTPS URL of crypto microservice. |
| `CRYPTO_SERVICE_API_KEY` | `dev-secret-key-123` | Bearer token secret for `crypto-service` requests. |
| `NODE_EXTRA_CA_CERTS` | `/app/certs/ca.crt` | Path to Root CA certificate for Node.js TLS verification. |
| `FABRIC_PEER_ENDPOINT` | `peer0.issuer.scatterid.com:7051` | gRPC endpoint of Fabric issuer peer. |

---

## 4. Execution & Testing Pipelines

```bash
# Install dependencies
npm install

# Run dev mode
npm run dev

# Run automated tests
npm test
```
