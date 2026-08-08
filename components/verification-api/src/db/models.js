import Database from 'better-sqlite3';
import { createHash } from 'crypto';

const db = new Database('credentials.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    data_hash TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    signature TEXT NOT NULL,
    prime_mod TEXT NOT NULL,
    required_shares INTEGER NOT NULL,
    anchor_tx_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    issued_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shard_references (
    id TEXT PRIMARY KEY,
    credential_id TEXT NOT NULL REFERENCES credentials(id),
    share_index INTEGER NOT NULL,
    share_value TEXT NOT NULL,
    share_hash TEXT NOT NULL,
    UNIQUE(credential_id, share_index)
  );

  CREATE INDEX IF NOT EXISTS idx_shard_refs_credential ON shard_references(credential_id);
`);

export function createCredential(record, shares) {
  const insertCred = db.prepare(`
    INSERT INTO credentials (id, data_hash, algorithm, signature, prime_mod, required_shares, anchor_tx_id, status, issued_at)
    VALUES (@id, @dataHash, @algorithm, @signature, @primeMod, @requiredShares, @anchorTxId, @status, @issuedAt)
  `);

  const insertShare = db.prepare(`
    INSERT INTO shard_references (id, credential_id, share_index, share_value, share_hash)
    VALUES (@id, @credentialId, @shareIndex, @shareValue, @shareHash)
  `);

  const runTransaction = db.transaction(() => {
    insertCred.run(record);
    for (const share of shares) {
      const [indexStr, value] = share.split('-');
      const shareHash = createHash('sha3-256').update(value).digest('hex');
      insertShare.run({
        id: `${record.id}-${indexStr}`,
        credentialId: record.id,
        shareIndex: parseInt(indexStr, 10),
        shareValue: value,
        shareHash,
      });
    }
  });

  runTransaction();
}

export function getCredentialById(id) {
  const stmt = db.prepare('SELECT * FROM credentials WHERE id = ?');
  return stmt.get(id);
}

export function getSharesByCredentialId(id) {
  const stmt = db.prepare('SELECT * FROM shard_references WHERE credential_id = ? ORDER BY share_index');
  return stmt.all(id);
}

export function updateStatus(id, status) {
  const stmt = db.prepare('UPDATE credentials SET status = ? WHERE id = ?');
  stmt.run(status, id);
}

export function updateAnchorInfo(id, anchorTxId, status) {
  const stmt = db.prepare('UPDATE credentials SET anchor_tx_id = ?, status = ? WHERE id = ?');
  stmt.run(anchorTxId, status, id);
}
