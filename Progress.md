# ScatterID Technical Progress & Architecture Ledger

This document serves as the central context and progress ledger for the ScatterID post-quantum sharded identity verification system.

---

## 1. System Overview

ScatterID is a post-quantum, sharded credential verification infrastructure designed to eliminate single points of failure in identity storage. Raw claims are never stored in plain text or single monolithic databases.

### Core Cryptographic Lifecycle
1. **Issuance Request**: Client submits raw credential JSON to the Verification API gateway.
2. **Packaging**: The Python `crypto-service` computes a SHA3-256 data hash, signs it using post-quantum signature algorithm **ML-DSA-65**, and splits the signature/claim payload into $k$-of-$n$ Shamir secret shares ($3$-of-$5$ default) with per-share SHA-256 checksums.
3. **Sharded Multi-DB Storage**: The Verification API routes each share to a separate isolated SQLite database node (`node_1.db` through `node_5.db`).
4. **Ledger Anchoring**: The credential ID, data hash, issuer MSP ID, and ISO timestamp are anchored on a private Hyperledger Fabric blockchain (`scatterid-channel`, `scatterproof` chaincode).
5. **Reconstruction-less Verification**: A verifier queries the Verification API with a `credentialId`. The API verifies the ledger anchor, retrieves $\ge 3$ valid shares from isolated SQLite databases (validating SHA-256 checksums and SHA3-256 hashes), and requests cryptographic signature verification from `crypto-service`.

---

## 2. Architecture & Decision Matrix

| Layer | Technology | Operational Details |
|---|---|---|
| Post-Quantum Cryptography | **ML-DSA-65** (`liboqs`) | Quantum-resistant digital signatures. Keys managed dynamically in Vault. |
| Key Management | **HashiCorp Vault** | KV v2 secrets engine on port 8200 storing active ML-DSA-65 keypair. |
| Secret Sharing | **Shamir's Secret Sharing** (`sslib`) | $3$-of-$5$ threshold scheme. Appends SHA-256 integrity checksums to share strings. |
| API Gateway & Storage | **Node.js / Express / better-sqlite3** | Port 3000. Manages 5 separate SQLite database instances (`node_1.db`..`node_5.db`). |
| Crypto Microservice | **Python 3.13 / Flask** | Port 5001 (HTTPS/TLS). Exposes `/package`, `/unpackage`, and `/rotate` endpoints. |
| Immutable Audit Ledger | **Hyperledger Fabric v2.5** | Channel `scatterid-channel`, Chaincode `scatterproof`. Raft orderer (7050), Peers (7051, 8051). |
| Control Dashboard | **Node.js / Express** | Port 4000. Dark-mode developer interface, DB explorer, and E2E diagnostic tester. |

---

## 3. Milestone Completion Ledger

### Phase 1: Core Cryptography & Multi-Node Architecture (Completed)
- [x] **Post-Quantum Crypto Integration**: Integrated `liboqs` with Python wrappers supporting ML-DSA-65 signatures.
- [x] **Vault KMS Engine**: Implemented `kms.py` interfacing with HashiCorp Vault over REST to store and rotate ML-DSA-65 keypairs dynamically.
- [x] **Shamir Fragmentation & Checksums**: Developed `sslib`-backed secret sharing with per-share SHA-256 integrity checksums (`<index>-<share_value>:<checksum>`).
- [x] **Multi-Database Shard Isolation**: Refactored `verification-api` database layer to maintain 5 distinct SQLite database connections (`node_1.db` through `node_5.db`), distributing shares deterministically across isolated database instances.
- [x] **Private Hyperledger Fabric Network**: Standup of custom 2-org Fabric network (`IssuerMSP`, `VerifierMSP`) with `scatterproof` Go chaincode for proof anchoring and state queries.
- [x] **Container Orchestration & Native Module Linking**: Dockerized services using Debian-based Node (`node:24`) and Python environments, configured `libnode-dev` for native C bindings (`better-sqlite3`), and established inter-container TLS.
- [x] **Developer Control Dashboard**: Built lightweight, high-contrast Vercel/HashiCorp inspired dashboard on port 4000 with real-time service health monitoring, multi-DB inspection, and interactive E2E smoke tests.

### Phase 2: Security Hardening & Resilience (In Progress)
- [ ] **Automated Key Rotation & Expiry**: Scheduled background rotation of ML-DSA-65 keypairs with backward-compatible signature validation against archived public keys in Vault.
- [ ] **Fault Tolerance & Node Drop Recovery**: Automated shard reconstruction tests under simulated loss or corruption of up to 2 database nodes.
- [ ] **RBAC & Token Authentication for Verification API**: Standardize OAuth2 / JWT client credentials for `/issue` and `/verify` endpoints.

### Phase 3: Distributed Cloud Rollout (Planned)
- [ ] **Infrastructure-as-Code (Terraform & Ansible)**: Provision multi-region node infrastructure in `components/infra/`.
- [ ] **Postgres Shard Migration**: Transition local SQLite shard files (`node_i.db`) to independent Postgres instances with mutual TLS.

---

## 4. Verification & Testing Coverage

1. **Native Dynamic Linking Test**: Verified `better-sqlite3` native C++ bindings under Node 24 standard distribution with `libnode-dev`.
2. **Cryptographic Round-Trip Test**: Verified `/package` and `/unpackage` operations using ML-DSA-65 signatures and Shamir 3-of-5 share reconstruction.
3. **Shard Integrity Checksum Test**: Verified detection and rejection of tampered share strings during the `/verify` request lifecycle.
4. **Hyperledger Fabric Chaincode Verification**: Verified `AnchorProof` transaction submission and `QueryProof` evaluation over gRPC (`@hyperledger/fabric-gateway`).
