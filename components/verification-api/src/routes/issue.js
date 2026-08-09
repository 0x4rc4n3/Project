import { randomUUID } from 'crypto';
import { createCredential, updateAnchorInfo, updateStatus } from '../db/models.js';
import { anchorProof } from '../chain/fabric.js';

export async function issueRoute(req, res) {
  const { claim } = req.body;

  if (!claim) {
    return res.status(400).json({
      error: 'Missing required field: claim',
      code: 'BAD_REQUEST',
    });
  }

  let credential;
  try {
    const cryptoUrl = process.env.CRYPTO_SERVICE_URL || 'https://localhost:5001';
    const response = await fetch(`${cryptoUrl}/package`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRYPTO_SERVICE_API_KEY}`,
      },
      body: JSON.stringify({ claim }),
    });

    if (!response.ok) {
      const errBody = await response.json();
      return res.status(502).json({
        error: `crypto-service rejected the request: ${errBody.error}`,
        code: 'CRYPTO_SERVICE_ERROR',
      });
    }

    credential = await response.json();
  } catch (err) {
    return res.status(502).json({
      error: 'Could not reach crypto-service',
      code: 'CRYPTO_SERVICE_UNREACHABLE',
    });
  }

  const id = randomUUID();

  createCredential(
    {
      id,
      dataHash: credential.data_hash,
      algorithm: credential.algorithm,
      signature: credential.signature,
      primeMod: credential.shares.prime_mod,
      requiredShares: credential.shares.required_shares,
      anchorTxId: null,
      status: 'pending',
      issuedAt: credential.created_at,
    },
    credential.shares.shares // array of "index-hexvalue" strings
  );

  let anchorTxId = null;
  try {
    anchorTxId = await anchorProof(id, credential.data_hash, 'IssuerMSP');
    updateAnchorInfo(id, anchorTxId, 'anchored');
  } catch (err) {
    console.error(`Fabric anchoring failed for credential ${id}:`, err);
    updateStatus(id, 'failed');
  }

  return res.status(201).json({
    status: anchorTxId ? 'anchored' : 'pending',
    credentialId: id,
    anchorTxId,
  });
}
