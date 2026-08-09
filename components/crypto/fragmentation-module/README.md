# Fragmentation & Post-Quantum Cryptography Module

This module provides the core Python library routines for ML-DSA-65 post-quantum signing, Shamir secret splitting, and share integrity validation used by the ScatterID crypto ecosystem.

---

## 1. Purpose & Architecture

The `fragmentation-module` houses pure cryptographic functions decoupled from web transport layers:

### Module Breakdown
- `src/pq_sign.py`: Wraps `liboqs` to generate and verify ML-DSA-65 signatures.
- `src/shamir.py`: Implements $k$-of-$n$ Shamir secret sharing ($3$-of-$5$) using `sslib` with SHA-256 integrity checksums.
- `src/interface.py`: Exposes `package_credential()` and `unpackage_credential()` routines combining PQC signatures with secret sharding.
- `src/keygen.py`: Standalone CLI utility for generating ML-DSA-65 keypairs for local testing.

---

## 2. Environment Variables

This pure python library does not rely on direct runtime environment variables; configuration options (e.g. threshold shares $k$, total shares $n$, algorithm choice) are passed as parameters into `package_credential()`.

---

## 3. Pipelines & Execution

### Setup & Local Development

```bash
python3 -m venv venv
source venv/bin/activate
pip install sslib oqs pytest
```

### Execution & Testing

Run unit and integration test suites:
```bash
python3 -m pytest tests/
```

Generate local test keypair:
```bash
python3 src/keygen.py
```
