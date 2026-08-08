package main

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SmartContract provides functions for managing proof records
type SmartContract struct {
	contractapi.Contract
}

// ProofRecord defines the structure of a proof record on the ledger
type ProofRecord struct {
	CredentialID string `json:"credentialId"`
	DataHash     string `json:"dataHash"`
	IssuerID     string `json:"issuerId"`
	Timestamp    string `json:"timestamp"`
	Status       string `json:"status"` // "active" | "revoked"
}

// AnchorProof records a new proof hash on the ledger
func (s *SmartContract) AnchorProof(ctx contractapi.TransactionContextInterface, credentialID string, dataHash string, issuerID string, timestamp string) error {
	exists, err := s.ProofExists(ctx, credentialID)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("the proof for credential %s already exists", credentialID)
	}

	// Access control: Ensure the caller has a valid client identity MSP
	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get client MSP ID: %v", err)
	}
	if clientMSPID == "" {
		return fmt.Errorf("client MSP ID is empty")
	}

	record := ProofRecord{
		CredentialID: credentialID,
		DataHash:     dataHash,
		IssuerID:     issuerID,
		Timestamp:    timestamp,
		Status:       "active",
	}

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(credentialID, recordJSON)
}

// QueryProof returns the ProofRecord stored in the ledger with given credentialID
func (s *SmartContract) QueryProof(ctx contractapi.TransactionContextInterface, credentialID string) (*ProofRecord, error) {
	recordJSON, err := ctx.GetStub().GetState(credentialID)
	if err != nil {
		return nil, fmt.Errorf("failed to read from world state: %v", err)
	}
	if recordJSON == nil {
		return nil, fmt.Errorf("the proof %s does not exist", credentialID)
	}

	var record ProofRecord
	err = json.Unmarshal(recordJSON, &record)
	if err != nil {
		return nil, err
	}

	return &record, nil
}

// RevokeProof sets the status of a proof record to "revoked"
func (s *SmartContract) RevokeProof(ctx contractapi.TransactionContextInterface, credentialID string, requestingIssuerID string) error {
	record, err := s.QueryProof(ctx, credentialID)
	if err != nil {
		return err
	}

	// Access control: only the original issuer org can revoke.
	clientMSPID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get client MSP ID: %v", err)
	}
	if clientMSPID == "" {
		return fmt.Errorf("client MSP ID is empty")
	}

	// Ensure the caller is the original issuer
	if record.IssuerID != requestingIssuerID {
		return fmt.Errorf("unauthorized: requesting issuer %s does not match original issuer %s", requestingIssuerID, record.IssuerID)
	}

	record.Status = "revoked"

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(credentialID, recordJSON)
}

// ProofExists returns true when proof record with given credentialID exists in world state
func (s *SmartContract) ProofExists(ctx contractapi.TransactionContextInterface, credentialID string) (bool, error) {
	recordJSON, err := ctx.GetStub().GetState(credentialID)
	if err != nil {
		return false, err
	}

	return recordJSON != nil, nil
}

func main() {
	chaincode, err := contractapi.NewChaincode(&SmartContract{})
	if err != nil {
		log.Panicf("Error creating scatterproof chaincode: %v", err)
	}

	if err := chaincode.Start(); err != nil {
		log.Panicf("Error starting scatterproof chaincode: %v", err)
	}
}
