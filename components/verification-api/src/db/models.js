import Database from 'better-sqlite3';
import { createHash } from 'crypto';

const NUM_NODES = 5;
const nodes = [];

for (let i = 1; i <= NUM_NODES; i++) {
  const nodeDb = new Database(`node_${i}.db`);
  nodeDb.exec(`
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
      share_checksum TEXT,
      UNIQUE(credential_id, share_index)
    );

    CREATE INDEX IF NOT EXISTS idx_shard_refs_credential ON shard_references(credential_id);
  `);
  nodes.push(nodeDb);
}

export function createCredential(record, shares) {
  for (const share of shares) {
    const [core, checksum] = share.split(':');
    const [indexStr, value] = core.split('-');
    const nodeIndex = parseInt(indexStr, 10) - 1;
    
    if (nodeIndex >= 0 && nodeIndex < NUM_NODES) {
      const db = nodes[nodeIndex];
      const insertCred = db.prepare(`
        INSERT OR IGNORE INTO credentials (id, data_hash, algorithm, signature, prime_mod, required_shares, anchor_tx_id, status, issued_at)
        VALUES (@id, @dataHash, @algorithm, @signature, @primeMod, @requiredShares, @anchorTxId, @status, @issuedAt)
      `);
      const insertShare = db.prepare(`
        INSERT INTO shard_references (id, credential_id, share_index, share_value, share_hash, share_checksum)
        VALUES (@id, @credentialId, @shareIndex, @shareValue, @shareHash, @shareChecksum)
      `);
      const shareHash = createHash('sha3-256').update(value).digest('hex');
      db.transaction(() => {
        insertCred.run(record);
        insertShare.run({
          id: `${record.id}-${indexStr}`,
          credentialId: record.id,
          shareIndex: parseInt(indexStr, 10),
          shareValue: value,
          shareHash,
          shareChecksum: checksum
        });
      })();
    }
  }
}

export function getCredentialById(id) {
  const stmt = nodes[0].prepare('SELECT * FROM credentials WHERE id = ?');
  return stmt.get(id);
}

export function getSharesByCredentialId(id) {
  const allShares = [];
  for (const db of nodes) {
    const stmt = db.prepare('SELECT * FROM shard_references WHERE credential_id = ?');
    const rows = stmt.all(id);
    allShares.push(...rows);
  }
  return allShares.sort((a, b) => a.share_index - b.share_index);
}

export function updateStatus(id, status) {
  for (const db of nodes) {
    const stmt = db.prepare('UPDATE credentials SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }
}

export function updateAnchorInfo(id, anchorTxId, status) {
  for (const db of nodes) {
    const stmt = db.prepare('UPDATE credentials SET anchor_tx_id = ?, status = ? WHERE id = ?');
    stmt.run(anchorTxId, status, id);
  }
}
