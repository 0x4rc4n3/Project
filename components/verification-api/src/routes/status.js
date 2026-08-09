import { getCredentialById } from '../db/models.js';

export async function statusRoute(req, res) {
  const { id } = req.params;

  const record = await getCredentialById(id);

  if (!record) {
    return res.status(404).json({
      error: 'Credential not found',
      code: 'NOT_FOUND',
    });
  }

  return res.status(200).json({
    id: record.id,
    dataHash: record.data_hash || record.dataHash,
    algorithm: record.algorithm,
    anchorTxId: record.anchor_tx_id || record.anchorTxId || null,
    status: record.status,
    issuedAt: record.issued_at || record.issuedAt,
  });
}
