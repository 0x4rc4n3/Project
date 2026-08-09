import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const NUM_NODES = 5;
const nodes = [];

const DB_DIR = process.env.DB_DIR || (fs.existsSync('/app/data') ? '/app/data' : path.resolve(process.cwd(), 'data'));
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Direct local SQLite fallback nodes
for (let i = 1; i <= NUM_NODES; i++) {
  const nodeDbPath = path.join(DB_DIR, `node_${i}.db`);
  const nodeDb = new Database(nodeDbPath);
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

  const stmts = {
    insertCred: nodeDb.prepare(`
      INSERT OR IGNORE INTO credentials (id, data_hash, algorithm, signature, prime_mod, required_shares, anchor_tx_id, status, issued_at)
      VALUES (@id, @dataHash, @algorithm, @signature, @primeMod, @requiredShares, @anchorTxId, @status, @issuedAt)
    `),
    insertShare: nodeDb.prepare(`
      INSERT OR REPLACE INTO shard_references (id, credential_id, share_index, share_value, share_hash, share_checksum)
      VALUES (@id, @credentialId, @shareIndex, @shareValue, @shareHash, @shareChecksum)
    `),
    getCred: nodeDb.prepare('SELECT * FROM credentials WHERE id = ?'),
    getShares: nodeDb.prepare('SELECT * FROM shard_references WHERE credential_id = ?'),
    updateStatus: nodeDb.prepare('UPDATE credentials SET status = ? WHERE id = ?'),
    updateAnchor: nodeDb.prepare('UPDATE credentials SET anchor_tx_id = ?, status = ? WHERE id = ?'),
  };

  nodes.push({ db: nodeDb, stmts, nodeId: i });
}

// Helper to get shard node URL
function getShardNodeUrl(nodeId) {
  if (process.env.SHARD_NODE_HOST_PREFIX) {
    return `${process.env.SHARD_NODE_HOST_PREFIX}${nodeId}:3000`;
  }
  // In Docker compose bridge network, hostnames are shard-node-1 .. shard-node-5
  return `http://shard-node-${nodeId}:3000`;
}

export async function createCredential(record, shares) {
  for (const share of shares) {
    const [core, checksum] = share.split(':');
    const [indexStr, value] = core.split('-');
    const shareIndex = parseInt(indexStr, 10);
    const nodeIndex = shareIndex - 1;

    if (nodeIndex >= 0 && nodeIndex < NUM_NODES) {
      const nodeUrl = getShardNodeUrl(shareIndex);
      let dispatchedHttp = false;

      try {
        const response = await fetch(`${nodeUrl}/shard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record, share })
        });
        if (response.ok) {
          dispatchedHttp = true;
        }
      } catch (err) {
        // Fallback to local SQLite instance if microservice HTTP request fails
      }

      // Always write to local node DB fallback
      const { db, stmts } = nodes[nodeIndex];
      const shareHash = createHash('sha3-256').update(value).digest('hex');

      db.transaction(() => {
        stmts.insertCred.run(record);
        stmts.insertShare.run({
          id: `${record.id}-${shareIndex}`,
          credentialId: record.id,
          shareIndex,
          shareValue: value,
          shareHash,
          shareChecksum: checksum,
        });
      })();
    }
  }
}

export async function getCredentialById(id) {
  // Try HTTP microservice first
  try {
    const response = await fetch(`${getShardNodeUrl(1)}/shard/${id}`);
    if (response.ok) {
      const data = await response.json();
      if (data.credential) return data.credential;
    }
  } catch (err) {}

  return nodes[0].stmts.getCred.get(id);
}

export async function getSharesByCredentialId(id) {
  const allShares = [];

  for (let i = 1; i <= NUM_NODES; i++) {
    let shardFetched = false;

    try {
      const response = await fetch(`${getShardNodeUrl(i)}/shard/${id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.share) {
          allShares.push(data.share);
          shardFetched = true;
        }
      }
    } catch (err) {}

    if (!shardFetched) {
      const rows = nodes[i - 1].stmts.getShares.all(id);
      allShares.push(...rows);
    }
  }

  return allShares.sort((a, b) => a.share_index - b.share_index);
}

export async function updateStatus(id, status) {
  for (let i = 1; i <= NUM_NODES; i++) {
    try {
      await fetch(`${getShardNodeUrl(i)}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: id, status })
      });
    } catch (err) {}
    nodes[i - 1].stmts.updateStatus.run(status, id);
  }
}

export async function updateAnchorInfo(id, anchorTxId, status) {
  for (let i = 1; i <= NUM_NODES; i++) {
    try {
      await fetch(`${getShardNodeUrl(i)}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: id, anchorTxId, status })
      });
    } catch (err) {}
    nodes[i - 1].stmts.updateAnchor.run(anchorTxId, status, id);
  }
}
