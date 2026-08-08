import { createHash } from 'crypto';
import { getCredentialById, getSharesByCredentialId } from '../db/models.js';
import { queryProof } from '../chain/fabric.js';

export async function verifyRoute(req, res) {
  const { credentialId } = req.body;

  if (!credentialId) {
    return res.status(400).json({
      error: 'Missing required field: credentialId',
      code: 'BAD_REQUEST',
    });
  }

  const record = getCredentialById(credentialId);
  if (!record) {
    return res.status(404).json({
      error: 'Credential not found',
      code: 'NOT_FOUND',
    });
  }

  // 1. Verify anchor status on Hyperledger Fabric ledger
  let anchorStatus = record.status;
  let isAnchoredOnChain = false;

  try {
    const fabricRecord = await queryProof(credentialId);
    anchorStatus = fabricRecord.status; // "active" | "revoked"
    isAnchoredOnChain = true;

    // Integrity check: verify ledger data hash matches database record data hash
    if (fabricRecord.dataHash !== record.data_hash) {
      console.warn(`WARNING: Ledger data hash mismatch for credential ${credentialId}`);
      return res.status(200).json({
        valid: false,
        anchorStatus: 'tampered_hash',
        issuedAt: record.issued_at,
        reason: 'Ledger data hash mismatch',
      });
    }

    if (anchorStatus === 'revoked') {
      return res.status(200).json({
        valid: false,
        anchorStatus: 'revoked',
        issuedAt: record.issued_at,
        reason: 'Credential has been revoked on the ledger',
      });
    }
  } catch (err) {
    console.warn(`Could not retrieve Fabric anchor for credential ${credentialId}:`, err.message);
    if (record.status === 'anchored') {
      anchorStatus = 'missing_anchor';
    }
  }

  const storedShares = getSharesByCredentialId(credentialId);

  // Integrity check: verify each share's hash before trusting it
  const validShares = storedShares.filter((row) => {
    const computedHash = createHash('sha3-256').update(row.share_value).digest('hex');
    return computedHash === row.share_hash;
  });

  const corruptedCount = storedShares.length - validShares.length;
  if (corruptedCount > 0) {
    console.warn(`WARNING: ${corruptedCount} corrupted share(s) detected for credential ${credentialId}`);
  }

  if (validShares.length < record.required_shares) {
    return res.status(200).json({
      valid: false,
      anchorStatus,
      issuedAt: record.issued_at,
      reason: `Insufficient valid shares: ${validShares.length} of ${record.required_shares} required (${corruptedCount} corrupted)`,
    });
  }

  const sharesSubset = validShares
    .slice(0, record.required_shares)
    .map((row) => `${row.share_index}-${row.share_value}`);

  const credential = {
    data_hash: record.data_hash,
    signature: record.signature,
    algorithm: record.algorithm,
    shares: {
      prime_mod: record.prime_mod,
      required_shares: record.required_shares,
      shares: sharesSubset,
    },
    created_at: record.issued_at,
  };

  try {
    const response = await fetch('https://localhost:5001/unpackage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRYPTO_SERVICE_API_KEY}`,
      },
      body: JSON.stringify({ credential, sharesSubset }),
    });

    if (!response.ok) {
      return res.status(200).json({
        valid: false,
        anchorStatus,
        issuedAt: record.issued_at,
      });
    }

    const result = await response.json();
    return res.status(200).json({
      valid: result.valid && (isAnchoredOnChain ? anchorStatus === 'active' : true),
      anchorStatus,
      issuedAt: record.issued_at,
    });
  } catch (err) {
    return res.status(502).json({
      error: 'Could not reach crypto-service',
      code: 'CRYPTO_SERVICE_UNREACHABLE',
    });
  }
}
