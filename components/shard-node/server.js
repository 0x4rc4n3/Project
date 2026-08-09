import express from 'express';
import Database from 'better-sqlite3';
import { createHash, createHmac } from 'crypto';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const NODE_INDEX = process.env.NODE_INDEX || '1';
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const SHARD_NODE_API_KEY = process.env.SHARD_NODE_API_KEY;

// Inter-Service Authentication Middleware
const authenticateInterService = (req, res, next) => {
  if (!SHARD_NODE_API_KEY) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing or malformed Authorization header' });
  }

  const token = authHeader.substring(7).trim();
  if (token !== SHARD_NODE_API_KEY) {
    return res.status(403).json({ success: false, error: 'Forbidden: Invalid inter-service authentication token' });
  }

  next();
};

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
app.post('/shard', authenticateInterService, (req, res) => {
  try {
    const { record, share } = req.body;
    if (!record || !share) {
      return res.status(400).json({ error: 'Missing record or share payload' });
    }

    const [core, checksum] = share.split(':');
    const [indexStr, value] = core.split('-');
    const shareIndex = parseInt(indexStr, 10);
    const shareHash = createHash('sha3-256').update(value).digest('hex');

    const normRecord = {
      id: record.id,
      dataHash: record.dataHash || record.data_hash,
      algorithm: record.algorithm,
      signature: record.signature,
      primeMod: record.primeMod || record.prime_mod,
      requiredShares: record.requiredShares || record.required_shares,
      anchorTxId: record.anchorTxId || record.anchor_tx_id || null,
      status: record.status || 'pending',
      issuedAt: record.issuedAt || record.issued_at,
    };

    db.transaction(() => {
      stmts.insertCred.run(normRecord);
      stmts.insertShare.run({
        id: `${normRecord.id}-${shareIndex}`,
        credentialId: normRecord.id,
        shareIndex,
        shareValue: value,
        shareHash,
        shareChecksum: checksum || null
      });
    })();

    res.status(201).json({ success: true, nodeId: NODE_INDEX, credentialId: normRecord.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Shard Route
app.get('/shard/:credentialId', authenticateInterService, (req, res) => {
  try {
    const cred = stmts.getCred.get(req.params.credentialId);
    const share = stmts.getShare.get(req.params.credentialId);
    res.json({ success: true, credential: cred, share });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Status / Anchor Route
app.post('/update-status', authenticateInterService, (req, res) => {
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
app.get('/integrity', authenticateInterService, (req, res) => {
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

process.on('SIGTERM', () => {
  console.log(`Shard Node ${NODE_INDEX} received SIGTERM, exiting...`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`Shard Node ${NODE_INDEX} received SIGINT, exiting...`);
  process.exit(0);
});
