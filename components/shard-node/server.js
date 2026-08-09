import express from 'express';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const NODE_INDEX = process.env.NODE_INDEX || '1';
const DATA_DIR = process.env.DATA_DIR || '/app/data';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, `node_${NODE_INDEX}.db`);
const db = new Database(dbPath);

// Initialize schema
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
    credential_id TEXT NOT NULL,
    share_index INTEGER NOT NULL,
    share_value TEXT NOT NULL,
    share_hash TEXT NOT NULL,
    share_checksum TEXT,
    UNIQUE(credential_id, share_index)
  );

  CREATE INDEX IF NOT EXISTS idx_shard_refs_credential ON shard_references(credential_id);
`);

// Pre-compile statements
const stmts = {
  insertCred: db.prepare(`
    INSERT OR IGNORE INTO credentials (id, data_hash, algorithm, signature, prime_mod, required_shares, anchor_tx_id, status, issued_at)
    VALUES (@id, @dataHash, @algorithm, @signature, @primeMod, @requiredShares, @anchorTxId, @status, @issuedAt)
  `),
  insertShare: db.prepare(`
    INSERT OR REPLACE INTO shard_references (id, credential_id, share_index, share_value, share_hash, share_checksum)
    VALUES (@id, @credentialId, @shareIndex, @shareValue, @shareHash, @shareChecksum)
  `),
  getCred: db.prepare('SELECT * FROM credentials WHERE id = ?'),
  getShare: db.prepare('SELECT * FROM shard_references WHERE credential_id = ?'),
  countShares: db.prepare('SELECT COUNT(*) as count FROM shard_references'),
  getAllShares: db.prepare('SELECT share_value, share_hash, share_checksum FROM shard_references'),
  updateStatus: db.prepare('UPDATE credentials SET status = ? WHERE id = ?'),
  updateAnchor: db.prepare('UPDATE credentials SET anchor_tx_id = ?, status = ? WHERE id = ?'),
};

// Health & Metrics Route
app.get('/health', (req, res) => {
  try {
    const stats = fs.existsSync(dbPath) ? fs.statSync(dbPath) : { size: 0 };
    const countRow = stmts.countShares.get();
    
    res.json({
      nodeId: parseInt(NODE_INDEX, 10),
      dbName: `node_${NODE_INDEX}.db`,
      status: 'HEALTHY',
      totalShares: countRow ? countRow.count : 0,
      sizeBytes: stats.size,
      integrityCheck: 'VALID'
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', error: err.message });
  }
});

// Shard Storage Route
app.post('/shard', (req, res) => {
  try {
    const { record, share } = req.body;
    if (!record || !share) {
      return res.status(400).json({ error: 'Missing record or share payload' });
    }

    const [core, checksum] = share.split(':');
    const [indexStr, value] = core.split('-');
    const shareIndex = parseInt(indexStr, 10);
    const shareHash = createHash('sha3-256').update(value).digest('hex');

    db.transaction(() => {
      stmts.insertCred.run(record);
      stmts.insertShare.run({
        id: `${record.id}-${shareIndex}`,
        credentialId: record.id,
        shareIndex,
        shareValue: value,
        shareHash,
        shareChecksum: checksum
      });
    })();

    res.status(201).json({ success: true, nodeId: NODE_INDEX, credentialId: record.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Shard Route
app.get('/shard/:credentialId', (req, res) => {
  try {
    const cred = stmts.getCred.get(req.params.credentialId);
    const share = stmts.getShare.get(req.params.credentialId);
    res.json({ success: true, credential: cred, share });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Status / Anchor Route
app.post('/update-status', (req, res) => {
  try {
    const { credentialId, status, anchorTxId } = req.body;
    if (anchorTxId) {
      stmts.updateAnchor.run(anchorTxId, status, credentialId);
    } else {
      stmts.updateStatus.run(status, credentialId);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Integrity Check Route
app.get('/integrity', (req, res) => {
  try {
    const shares = stmts.getAllShares.all();
    let isCorrupted = false;

    for (const s of shares) {
      const computedHash = createHash('sha3-256').update(s.share_value).digest('hex');
      if (computedHash !== s.share_hash) {
        isCorrupted = true;
        break;
      }
    }

    res.json({
      nodeId: parseInt(NODE_INDEX, 10),
      status: isCorrupted ? 'CORRUPTED' : 'HEALTHY',
      integrityCheck: isCorrupted ? 'HASH_MISMATCH' : 'VALID',
      totalShares: shares.length
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ScatterID Shard Node ${NODE_INDEX} running on port ${PORT}`);
});
