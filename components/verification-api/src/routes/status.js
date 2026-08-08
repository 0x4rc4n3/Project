import { getCredentialById } from '../db/models.js';

export function statusRoute(req, res) {
  const { id } = req.params;

  const record = getCredentialById(id);

  if (!record) {
    return res.status(404).json({
      error: 'Credential not found',
      code: 'NOT_FOUND',
    });
  }

  return res.status(200).json({
    id: record.id,
    dataHash: record.data_hash,
    algorithm: record.algorithm,
    anchorTxId: record.anchor_tx_id,
    status: record.status,
    issuedAt: record.issued_at,
  });
}
