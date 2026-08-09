# Blockchain Component (`blockchain`)

The `blockchain` component houses the custom Hyperledger Fabric network configuration and the Go smart contract (`chaincode`) for immutable proof anchoring.

---

## 1. Purpose & Architecture

ScatterID relies on a private, permissioned Hyperledger Fabric blockchain network to record cryptographic proofs of credentials without exposing raw identity data.

### Network Topology
- **Orderer Node**: `orderer.scatterid.com` (Raft consensus, port 7050, admin port 7053).
- **Issuer Organization (`IssuerMSP`)**: `peer0.issuer.scatterid.com` (port 7051). Responsible for anchoring initial credential proof records via `AnchorProof`.
- **Verifier Organization (`VerifierMSP`)**: `peer0.verifier.scatterid.com` (port 8051). Reads and evaluates proof status via `QueryProof`.
- **Channel**: `scatterid-channel`.

### Chaincode (`scatterproof.go`)
Written in Go using `fabric-contract-api-go`. Implements the following state operations:
- `AnchorProof(credentialId, dataHash, issuerId, timestamp)`: Writes new active proof record to state database.
- `QueryProof(credentialId)`: Reads `ProofRecord` JSON from ledger state.
- `RevokeProof(credentialId, issuerId)`: Updates record status to `revoked`.
- `ProofExists(credentialId)`: Returns boolean indicating whether a proof exists.

---

## 2. Environment Variables & Network Ports

| Service / Binary | Default Port | Description |
|---|---|---|
| `orderer.scatterid.com` | `7050` / `7053` | Fabric Raft orderer gRPC & OSN admin port. |
| `peer0.issuer.scatterid.com` | `7051` | Issuer peer node gRPC endpoint. |
| `peer0.verifier.scatterid.com` | `8051` | Verifier peer node gRPC endpoint. |
| `CORE_PEER_TLS_ENABLED` | `true` | Enables mTLS across all peer communications. |

---

## 3. Pipelines & Execution

### Starting the Fabric Network

To initialize certificates, channel artifacts, start containerized orderers/peers, and commit the `scatterproof` chaincode:

```bash
cd fabric-network
./start.sh
```

### Stopping & Cleaning Up Network

To tear down running Fabric containers and remove generated crypto material:

```bash
cd fabric-network
./stop.sh
```

### Chaincode Development & Testing

Chaincode source code is located in `chaincode/src/scatterproof.go`.

To test or compile Go chaincode locally:
```bash
cd chaincode/src
go test -v ./...
go build
```
