# Crypto Microservice (`crypto-service`)

The `crypto-service` component is a high-security Python Flask microservice responsible for post-quantum signature generation, key lifecycle management, and credential sharding.

---

## 1. Purpose & Architecture

`crypto-service` acts as the core cryptographic authority for ScatterID. It executes post-quantum cryptographic (PQC) operations using `liboqs` (Open Quantum Safe C library) and handles Shamir secret fragmentation.

### Key Responsibilities
- **Post-Quantum Digital Signatures**: Generates and verifies **ML-DSA-65** signatures over credential payloads.
- **Shamir Secret Sharing**: Packages raw credentials into $k$-of-$n$ ($3$-of-$5$) secret shares using `sslib`, attaching SHA-256 integrity checksums to every share.
- **Key Management (KMS)**: Interacts with HashiCorp Vault over REST using the `hvac` SDK to store, retrieve, and rotate ML-DSA-65 keypairs. No private keys are stored on local disk or environment variables.
- **Mutual TLS & API Key Enforcer**: Listens on port 5001 over HTTPS and requires a valid `Bearer <CRYPTO_SERVICE_API_KEY>` HTTP header for all requests.

### Service Endpoints
- `POST /package`: Accepts `{ "claim": ... }`, generates ML-DSA-65 signature and 5 Shamir shares, returning the packaged credential object.
- `POST /unpackage`: Accepts `{ "credential": ..., "sharesSubset": [...] }`, validates share checksums, reconstructs the secret, and verifies the ML-DSA-65 signature.
- `POST /rotate`: Triggers generation of a new ML-DSA-65 keypair in HashiCorp Vault.

---

## 2. Environment Variables

The service reads configuration from the environment at startup:

| Variable | Required | Default | Description |
|---|---|---|---|
| `CRYPTO_SERVICE_API_KEY` | Yes | *None* | Secret API key required for client bearer authentication (`Authorization: Bearer <KEY>`). |
| `VAULT_ADDR` | Yes | `http://127.0.0.1:8200` | Address of the HashiCorp Vault server. |
| `VAULT_TOKEN` | Yes | `dev-root-token` | Vault access token with read/write permissions for the `secret/data/crypto` path. |

---

## 3. Pipelines & Execution

### Local Development Setup

1. Prerequisites: Python 3.13, `cmake`, `build-essential`, `git`, and `liboqs` C library compiled and installed on system path or virtual environment.

2. Create virtual environment and install dependencies:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

3. Ensure TLS certificates are generated:
```bash
bash ../certs/generate_certs.sh
```

4. Run the service locally:
```bash
export CRYPTO_SERVICE_API_KEY="dev-secret-key-123"
export VAULT_ADDR="http://localhost:8200"
export VAULT_TOKEN="dev-root-token"
python app.py
```

### Container Build & Run

1. Build Docker image:
```bash
docker build -t scatterid-crypto .
```

2. Run Docker container manually:
```bash
docker run -d \
  --name scatterid-crypto \
  -p 5001:5001 \
  -e CRYPTO_SERVICE_API_KEY="dev-secret-key-123" \
  -e VAULT_ADDR="http://vault:8200" \
  -e VAULT_TOKEN="dev-root-token" \
  -v $(pwd)/../certs:/app/certs \
  scatterid-crypto
```

### Testing

Run unit tests and verification checks:
```bash
pytest
```
