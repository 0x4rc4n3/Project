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
      try {
        await fetch(`${nodeUrl}/shard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record, share }),
          signal: AbortSignal.timeout(2000)
        });
      } catch (err) {
        console.warn(`Failed to dispatch share ${shareIndex} to ${nodeUrl}:`, err.message);
      }

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
  for (let i = 1; i <= NUM_NODES; i++) {
    try {
      const response = await fetch(`${getShardNodeUrl(i)}/shard/${id}`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const data = await response.json();
        if (data.credential) return data.credential;
      }
    } catch (err) {}
  }

  // Fallback to local DB if available
  return nodes[0].stmts.getCred.get(id);
}

export async function getSharesByCredentialId(id) {
  const allShares = [];

  for (let i = 1; i <= NUM_NODES; i++) {
    let share = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`${getShardNodeUrl(i)}/shard/${id}`, { signal: AbortSignal.timeout(1200) });
        if (response.ok) {
          const data = await response.json();
          if (data.share) {
            share = data.share;
            break;
          }
        }
      } catch (err) {
        if (attempt === 0) await new Promise(r => setTimeout(r, 200));
      }
    }

    if (share) {
      allShares.push(share);
    } else {
      console.warn(`Shard Node ${i} is OFFLINE/UNREACHABLE`);
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

export async function healShards(nodeId = null) {
  const syncedEvents = [];
  const targetNodes = nodeId ? [parseInt(nodeId, 10)] : [1, 2, 3, 4, 5];

  for (const nId of targetNodes) {
    const nodeIndex = nId - 1;
    const nodeUrl = getShardNodeUrl(nId);

    try {
      const hRes = await fetch(`${nodeUrl}/health`, { signal: AbortSignal.timeout(1200) });
      if (!hRes.ok) continue;
    } catch (e) {
      continue;
    }

    const { db } = nodes[nodeIndex];
    const localShares = db.prepare(`
      SELECT s.*, c.data_hash, c.algorithm, c.signature, c.prime_mod, c.required_shares, c.anchor_tx_id, c.status, c.issued_at 
      FROM shard_references s 
      JOIN credentials c ON s.credential_id = c.id 
      WHERE s.share_index = ?
    `).all(nId);

    let healedCount = 0;
    for (const row of localShares) {
      try {
        const checkRes = await fetch(`${nodeUrl}/shard/${row.credential_id}`, { signal: AbortSignal.timeout(1000) });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (!checkData.share) {
            const record = {
              id: row.credential_id,
              dataHash: row.data_hash,
              algorithm: row.algorithm,
              signature: row.signature,
              primeMod: row.prime_mod,
              requiredShares: row.required_shares,
              anchorTxId: row.anchor_tx_id,
              status: row.status,
              issuedAt: row.issued_at
            };
            const share = `${row.share_index}-${row.share_value}:${row.share_checksum || ''}`;

            const syncRes = await fetch(`${nodeUrl}/shard`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ record, share })
            });
            if (syncRes.ok) healedCount++;
          }
        }
      } catch (e) {}
    }

    syncedEvents.push({
      nodeId: nId,
      healedShares: healedCount,
      timestamp: new Date().toISOString(),
      logText: `[AUTO-HEAL] Shard Node ${nId} auto-synced ${healedCount} missing secret shares.`
    });
  }

  return syncedEvents;
}
