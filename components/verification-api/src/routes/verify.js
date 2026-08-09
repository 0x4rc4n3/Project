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

  const record = await getCredentialById(credentialId);
  if (!record) {
    return res.status(404).json({
      error: 'Credential not found',
      code: 'NOT_FOUND',
    });
  }

  const recDataHash = record.data_hash || record.dataHash;
  const recPrimeMod = record.prime_mod || record.primeMod;
  const recRequiredShares = record.required_shares || record.requiredShares;
  const recIssuedAt = record.issued_at || record.issuedAt;

  // 1. Verify anchor status on Hyperledger Fabric ledger
  let anchorStatus = record.status;
  let isAnchoredOnChain = false;

  try {
    const fabricRecord = await queryProof(credentialId);
    anchorStatus = fabricRecord.status; // "active" | "revoked"
    isAnchoredOnChain = true;

    // Integrity check: verify ledger data hash matches database record data hash
    if (fabricRecord.dataHash !== recDataHash) {
      console.warn(`WARNING: Ledger data hash mismatch for credential ${credentialId}`);
      return res.status(200).json({
        valid: false,
        anchorStatus: 'tampered_hash',
        issuedAt: recIssuedAt,
        reason: 'Ledger data hash mismatch',
      });
    }

    if (anchorStatus === 'revoked') {
      return res.status(200).json({
        valid: false,
        anchorStatus: 'revoked',
        issuedAt: recIssuedAt,
        reason: 'Credential has been revoked on the ledger',
      });
    }
  } catch (err) {
    console.warn(`Could not retrieve Fabric anchor for credential ${credentialId}:`, err.message);
    if (record.status === 'anchored') {
      anchorStatus = 'missing_anchor';
    }
  }

  const storedShares = await getSharesByCredentialId(credentialId);

  // Integrity check: verify each share's hash before trusting it
  const validShares = storedShares.filter((row) => {
    if (!row || !row.share_value) return false;
    const computedHash = createHash('sha3-256').update(row.share_value).digest('hex');
    if (row.share_hash && computedHash.toLowerCase() !== row.share_hash.trim().toLowerCase()) return false;

    // Validate the SHA-256 checksum appended by fragmentation module
    if (row.share_checksum && row.share_checksum.trim() !== '') {
      const coreShare = `${row.share_index}-${row.share_value}`;
      const computedChecksum = createHash('sha256').update(coreShare).digest('hex');
      if (computedChecksum.toLowerCase() !== row.share_checksum.trim().toLowerCase()) return false;
    }
    
    return true;
  });

  const corruptedCount = storedShares.length - validShares.length;
  if (corruptedCount > 0) {
    console.warn(`WARNING: ${corruptedCount} corrupted share(s) detected for credential ${credentialId}`);
  }

  if (validShares.length < recRequiredShares) {
    return res.status(200).json({
      valid: false,
      anchorStatus,
      issuedAt: recIssuedAt,
      reason: `Insufficient valid shares: ${validShares.length} of ${recRequiredShares} required (${corruptedCount} corrupted)`,
    });
  }

  const sharesSubset = validShares
    .slice(0, recRequiredShares)
    .map((row) => `${row.share_index}-${row.share_value}`);

  const credential = {
    data_hash: recDataHash,
    signature: record.signature,
    algorithm: record.algorithm,
    public_key: record.public_key || record.publicKey || null,
    shares: {
      prime_mod: recPrimeMod,
      required_shares: recRequiredShares,
      shares: sharesSubset,
    },
    created_at: recIssuedAt,
  };

  try {
    const cryptoUrl = process.env.CRYPTO_SERVICE_URL || 'https://localhost:5001';
    const response = await fetch(`${cryptoUrl}/unpackage`, {
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
        issuedAt: recIssuedAt,
        reason: 'Crypto microservice failed to unpackage shares',
      });
    }

    const result = await response.json();
    const isValid = result.valid && (isAnchoredOnChain ? anchorStatus === 'active' : record.status !== 'revoked' && record.status !== 'failed');
    return res.status(200).json({
      valid: isValid,
      anchorStatus,
      issuedAt: recIssuedAt,
      reason: isValid ? undefined : (anchorStatus === 'revoked' ? 'Credential revoked' : 'Signature or reconstruction invalid'),
    });
  } catch (err) {
    console.error('Error reaching crypto-service in verify:', err);
    return res.status(502).json({
      error: `Could not reach crypto-service: ${err.message}`,
      code: 'CRYPTO_SERVICE_UNREACHABLE',
    });
  }
}
