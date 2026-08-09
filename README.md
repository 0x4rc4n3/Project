# ScatterID — Post-Quantum Sharded Credential Verification Architecture

![ScatterID Architecture](https://img.shields.io/badge/Security-Post--Quantum_ML--DSA--65-purple)
![Hyperledger Fabric](https://img.shields.io/badge/Blockchain-Hyperledger_Fabric_v2.5-green)
![Sharding](https://img.shields.io/badge/Shards-5_Isolated_Containers-cyan)
![Node](https://img.shields.io/badge/Node-v24-blue)
![Python](https://img.shields.io/badge/Python-v3.13-yellow)

ScatterID is a post-quantum, sharded credential verification infrastructure designed to eliminate single points of failure in identity storage. Raw claims are never stored in plain text or single monolithic databases.

---

## ⚡ Clone & Quick-Start Guide

ScatterID is configured to run out-of-the-box on any Linux / macOS device equipped with Docker.

### 1. Clone Repository
```bash
git clone git@github.com:0x4rc4n3/Project.git ScatterID
cd ScatterID
```

### 2. Audit System Dependencies
Run the automated component-wise dependency auditor:
```bash
./check_deps.sh
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

## 📚 Technical References

- **[`DEPENDENCIES.md`](DEPENDENCIES.md)**: Full component-wise dependency matrix and C/C++ compilation details.
- **[`Progress.md`](Progress.md)**: Live progress ledger and learning roadmap.
- **[`start.sh`](start.sh)**: Master idempotent startup script.
- **[`test_all.sh`](test_all.sh)**: Master automated test suite.
