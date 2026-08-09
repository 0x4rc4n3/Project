# Blockchain Component (`blockchain`)

The `blockchain` component houses the Go smart contract (`chaincode`) and local Hyperledger Fabric v2.5 network configuration.

---

## 1. Network Topology & Smart Contract

### Hyperledger Fabric Network
- **Orderer Node**: `orderer.scatterid.com` (Raft consensus, ports `7050` gRPC / `7053` OSN admin).
- **Issuer MSP (`IssuerMSP`)**: `peer0.issuer.scatterid.com` (port `7051`).
- **Verifier MSP (`VerifierMSP`)**: `peer0.verifier.scatterid.com` (port `8051`).
- **Channel**: `scatterid-channel`.

### Chaincode Architecture (`scatterproof.go`)
Written in Go using `fabric-contract-api-go`. Data structure:
```go
type ProofRecord struct {
    CredentialID string `json:"credentialId"`
    DataHash     string `json:"dataHash"`
    IssuerID     string `json:"issuerId"`
    Timestamp    string `json:"timestamp"`
    Status       string `json:"status"` // "active" | "revoked"
}
```

#### Smart Contract Methods
- `AnchorProof(ctx, credentialID, dataHash, issuerID, timestamp)`: Writes new `ProofRecord` state with `Status="active"`. Checks client identity MSP ID.
- `QueryProof(ctx, credentialID)`: Evaluates and returns stored `ProofRecord` JSON.
- `RevokeProof(ctx, credentialID, issuerID)`: Updates `ProofRecord` status to `"revoked"`.
- `ProofExists(ctx, credentialID)`: Returns boolean indicating whether a proof exists.

---

## 2. Operations & Execution

### Starting Network
```bash
cd fabric-network
./start.sh
```

### Stopping Network
```bash
cd fabric-network
./stop.sh
```

### Chaincode Testing
```bash
cd chaincode/src
go test -v ./...
```
