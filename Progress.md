# ScatterID / Crypto Project — Technical Context & Progress Log

> **Purpose of this file:** Paste this into a new AI chat (or read it yourself) to restore full context instantly. This is the persistent memory that survives across sessions.

---

## 1. What This Project Is

Post-quantum, sharded identity credential verification infrastructure. Core pitch: identity data is permanent (unlike passwords), so it needs cryptography that survives future quantum computers, and it should never exist as one complete, stealable copy anywhere.

**Core mechanism:**
1. A claim (e.g. `{"student": "X", "degree": "Y"}`) gets hashed (SHA3-256) and signed with a post-quantum signature (ML-DSA-65).
2. The signed data is split into `k`-of-`n` Shamir secret shares (default k=3, n=5) — no single storage location ever holds a complete, usable credential.
3. A verifier can check validity (`valid: true/false`) without ever seeing the raw claim data — reconstruction-less verification.
4. A proof hash gets anchored on a private Hyperledger Fabric blockchain for tamper-evidence.

**Team status:** Solo — just the user + AI assistant.

---

## 2. Locked Architecture Decisions (from ADR)

| Decision | Value | Notes |
|---|---|---|
| PQC signature algorithm | **ML-DSA-65** | Confirmed exact string works via `oqs.get_enabled_sig_mechanisms()` on real liboqs build |
| Hash function | SHA3-256 | Quantum-resistant enough |
| Secret-sharing scheme | **Shamir's Secret Sharing**, k=3, n=5 (MVP default) | Using `sslib` Python library |
| Backend language | **Node.js** (Express) | `components/verification-api` on port 3000 |
| Crypto language | **Python** | `components/crypto/fragmentation-module` + `components/crypto/crypto-service` on port 5001 |
| Blockchain | Hyperledger Fabric (private, permissioned) | **Custom custom-built network** on port 7050 (`scatterid-channel`), using custom MSPs (`IssuerMSP`, `VerifierMSP`) |
| Control Dashboard | Node.js Express dashboard on port 4000 | `components/project-dashboard` |
| Database | SQLite (dev), Postgres later | Currently SQLite only (stored in `components/verification-api/credentials.db`) |

---

## 3. What's Actually Built and Working (Verified, Not Assumed)

### `components/blockchain/` (Custom Go Chaincode & Network Setup) — working, fully integrated
- Custom local containerized network running a Raft orderer (`orderer.scatterid.com`) and two organizations: `IssuerOrg` (`IssuerMSP`) and `VerifierOrg` (`VerifierMSP`) with internal TLS active under `components/blockchain/fabric-network/`.
- Smart contract (`components/blockchain/chaincode/src/scatterproof.go`) committed and committed to `scatterid-channel` across both peers.
- Automated idempotent control scripts: `start.sh` and `stop.sh` created to set up certificates, genesis block, containers, channel, and chaincode.

### `components/project-dashboard/` (Node.js/Express, port 4000) — working, fully integrated
- Stunning custom-built dark-mode, glassmorphic Control Dashboard.
- Live health status monitor of APIs (Verification, Crypto) and Fabric nodes.
- Direct SQLite DB explorer showcasing synchronized credentials and shard tables.
- Interactive E2E diagnostics smoke tester triggering a complete transaction lifecycle (Issue -> Shard -> Sign -> Anchor -> Verify) with simulated typing console logs.
- Dynamic Mermaid-rendered architecture map showing cryptographic and network trust boundaries.

### `components/crypto/fragmentation-module/` (Python) — functionally complete
- PQC signing (ML-DSA-65) and Shamir secret sharing (k=3, n=5) using `sslib` with hex-encoded bytes.
- Fully verified via pytest tests.

### `components/crypto/crypto-service/` (Python Flask, port 5001) — working, secured
- Exposes `/package`, `/unpackage`, and `/rotate` endpoints over HTTPS.
- Integrated a production-grade KMS (`kms.py`) that stores and retrieves the ML-DSA-65 signing keypair directly within HashiCorp Vault KV storage (using the official `hvac` SDK). No keys are ever written to disk or environment variables.
- Enforces Bearer token authorization header using the `CRYPTO_SERVICE_API_KEY` env variable.
- Utilizes self-signed certificates stored in `components/crypto/certs/`.

### `components/verification-api/` (Node.js/Express, port 3000) — working, core complete
- Normalized database schema (SQLite) storing credentials and shard references.
- `/issue` and `/verify` routes fully integrated with `crypto-service` and custom Fabric client gateway (`src/chain/fabric.js`).
- Communication with `crypto-service` is fully secured using HTTPS and API Key Authorization. Trusts the generated Root CA by setting the `NODE_EXTRA_CA_CERTS` environment variable.

---

## 4. Known Technical Debt (Documented, Not Forgotten)

- **Ansible/Terraform IaC files** in `components/infra/` are currently skeleton folders waiting for Phase 3 rollout config.

---

## 5. Real Bugs Hit and Fixed (Useful Debugging Pattern Library)

1. **`ModuleNotFoundError`** — running scripts from wrong working directory.
2. **`pytest` vs `python3 -m pytest`** — bare `pytest` resolved to a different system-wide install.
3. **JS `const` temporal dead zone** — used `app.get` before `const app = express()` was declared.
4. **Python `bytes` not JSON-serializable** — hex-encoded Shamir shares.
5. **JS Uint8Array.toString() comma separation** — fixed by using `TextDecoder` to parse response buffers.
6. **Fabric test-network hardcoding** — replaced generic `Org1`/`Org2` from `fabric-samples` with dedicated custom organizations (`IssuerMSP`, `VerifierMSP`) and corrected connection certs in the gateway.

---

## 6. Environment / Setup Facts (So You Don't Re-Discover These)

- OS: Kali Linux
- Project root: `~/ScatterID`
- Node version: v24.15.0 (supports ES Modules)
- Python: 3.13.12, using per-module `venv/` folders
- liboqs: built from source

---

## 7. Immediate Open Question (Where We Left Off)

- Next step option: Start the local secure network and test E2E issuance and verification (including running the diagnostics smoke test via the dashboard).
- Next step option: Scale out the automated cloud playbooks under `infra/` using Terraform and Ansible to mimic the local custom Fabric configuration on cloud nodes (Phase 3).

