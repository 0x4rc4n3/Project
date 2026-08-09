# ScatterID — Post-Quantum Sharded Credential Verification Architecture

![ScatterID Architecture](https://img.shields.io/badge/Security-Post--Quantum_ML--DSA--65-purple)
![Hyperledger Fabric](https://img.shields.io/badge/Blockchain-Hyperledger_Fabric_v2.5-green)
![Sharding](https://img.shields.io/badge/Shards-5_Isolated_Containers-cyan)
![Node](https://img.shields.io/badge/Node-v24-blue)
![Python](https://img.shields.io/badge/Python-v3.13-yellow)

ScatterID is an enterprise post-quantum, sharded credential verification infrastructure designed to eliminate single points of failure in identity storage. Raw claims are never stored in plain text or single monolithic databases.

---

## ⚡ Clone & Quick-Start Guide

ScatterID is 100% containerized and runs out-of-the-box on any Linux or macOS machine with Docker installed.

### 1. Clone Repository
```bash
git clone git@github.com:0x4rc4n3/Project.git ScatterID
cd ScatterID
```

### 2. Audit System Dependencies & Auto-Install
Run the automated component-wise dependency auditor:
```bash
./check_deps.sh

# Or auto-install missing packages on Ubuntu/Debian/macOS:
./check_deps.sh --install
```

### 3. Initialize & Start Stack
Run the single master startup script (auto-generates TLS certs, initializes Vault, and starts all 14 container services):
```bash
./start.sh
```

### 4. Run End-to-End Test Suite
Run the 5-step automated end-to-end verification test suite:
```bash
./test_all.sh
```

---

## ⚙️ Customer-to-Customer Environment Customization

Every customer-specific setting (API keys, custom domain URLs, exposed ports, Vault tokens, and Hyperledger Fabric parameters) is configured in `.env`.

```bash
# Copy configuration template
cp .env.example .env
```

### Key Customer Settings in `.env`:
```ini
# Security Keys
CRYPTO_SERVICE_API_KEY=customer-secret-key-123
VAULT_TOKEN=customer-vault-token-123

# Domain Endpoints
VERIFICATION_API_URL=https://api.customer-domain.com
CRYPTO_SERVICE_URL=https://crypto-service:5001

# Configurable Host Ports
PORT_VERIFICATION_API=3000
PORT_CRYPTO_SERVICE=5001
PORT_DASHBOARD=4000
PORT_VAULT=8200
PORT_SHARD_1=3001
```

For full customer setup details, see **[`SETUP_AND_USAGE.md`](SETUP_AND_USAGE.md)**.

---

## 🌐 Live Web Dashboards & Endpoints

| Service | Protocol / Port | Endpoint | Description |
|---|---|---|---|
| **Control Dashboard** | `http://localhost:4000` | `/` | Developer control console, 5-node shard matrix & container logs |
| **Verification API Gateway** | `http://localhost:3000` | `/issue`, `/verify` | Main REST API gateway |
| **Crypto Microservice** | `https://localhost:5001` | `/package`, `/rotate` | Post-quantum ML-DSA-65 signing service |
| **HashiCorp Vault KMS** | `http://localhost:8200` | `/v1/secret` | Key management service |
| **Shard Node 1 .. 5** | `http://localhost:3001..3005` | `/health`, `/shard` | Isolated database container endpoints |

---

## 🛠️ Architecture Overview

```
                      ┌─────────────────────────┐
                      │  Client SDK / CLI       │
                      └────────────┬────────────┘
                                   │ 1. POST /issue
                                   ▼
                      ┌─────────────────────────┐
                      │ Verification API Gateway│
                      │       (Port 3000)       │
                      └────┬───────────────┬────┘
      2. POST /package    │               │ 3. Dispatch Shards
                           ▼               ▼
┌───────────────────────────┐     ┌───────────────────────────┐
│  Crypto Service (Port 5001)│     │ 5 Isolated Shard Nodes    │
│  - ML-DSA-65 Signature    │     │ (shard-node-1 .. 5)       │
│  - Shamir 3-of-5 Splitting│     └───────────────────────────┘
└─────────────┬─────────────┘
              │ Load Key
              ▼
┌───────────────────────────┐     ┌───────────────────────────┐
│ HashiCorp Vault KMS       │     │ Hyperledger Fabric Network│
│ (Port 8200)               │     │ (scatterproof Chaincode)  │
└───────────────────────────┘     └───────────────────────────┘
```

---

## 🔒 Docker Self-Sufficiency Analysis

ScatterID is **100% self-sufficient inside Docker containers**:
- **0 Host C/C++ Libraries Required**: `liboqs` C-library and Python wrappers are built inside `crypto-service/Dockerfile`.
- **0 Host Node Modules Required**: `better-sqlite3` native C++ V8 bindings are compiled inside `verification-api/Dockerfile` and `shard-node/Dockerfile`.
- **0 Host Python Packages Required**: All cryptographic dependencies (`liboqs-python`, `sslib`, `hvac`) are isolated inside container layers.

---

## 📚 Technical Documentation Index

- **[`SETUP_AND_USAGE.md`](SETUP_AND_USAGE.md)**: Comprehensive setup, customer onboarding, TLS management, and REST API integration guide.
- **[`DEPENDENCIES.md`](DEPENDENCIES.md)**: Full component-wise dependency matrix and C/C++ compilation details.
- **[`Progress.md`](Progress.md)**: Live progress ledger and learning roadmap.
- **[`start.sh`](start.sh)**: Master idempotent startup script.
- **[`test_all.sh`](test_all.sh)**: Master automated test suite.
- **[`check_deps.sh`](check_deps.sh)**: System dependency auditor & auto-installer (`./check_deps.sh --install`).
