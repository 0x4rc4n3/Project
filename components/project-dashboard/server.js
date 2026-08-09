import express from 'express';
import Database from 'better-sqlite3';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

const VERIFICATION_API_URL = process.env.VERIFICATION_API_URL || 'http://verification-api:3000';
const CRYPTO_SERVICE_HOST = process.env.CRYPTO_SERVICE_HOST || 'crypto-service';
const VERIFICATION_API_HOST = process.env.VERIFICATION_API_HOST || 'verification-api';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Path to SQLite DB
const dbPath = process.env.SQLITE_DB_PATH || path.resolve(__dirname, '../verification-api/credentials.db');

// Helper to check if a port/host is reachable
function checkPort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

// Helper to run shell commands
function runCmd(command) {
  return new Promise((resolve) => {
    exec(command, { cwd: path.resolve(__dirname, '../..') }, (error, stdout, stderr) => {
      resolve({
        success: !error,
        stdout: stdout ? stdout.trim() : '',
        stderr: stderr ? stderr.trim() : ''
      });
    });
  });
}

// API: System Status
app.get('/api/status', async (req, res) => {
  const cryptoServiceUp = await checkPort(5001, CRYPTO_SERVICE_HOST) || await checkPort(5001, '127.0.0.1');
  const verificationApiUp = await checkPort(3000, VERIFICATION_API_HOST) || await checkPort(3000, '127.0.0.1');

  // Check Docker containers (or direct TCP ports for container environment)
  let ordererUp = await checkPort(7050, 'orderer.scatterid.com') || await checkPort(7050, 'host.docker.internal') || await checkPort(7050, '127.0.0.1');
  let issuerPeerUp = await checkPort(7051, 'peer0.issuer.scatterid.com') || await checkPort(7051, 'host.docker.internal') || await checkPort(7051, '127.0.0.1');
  let verifierPeerUp = await checkPort(8051, 'peer0.verifier.scatterid.com') || await checkPort(8051, 'host.docker.internal') || await checkPort(8051, '127.0.0.1');

  const dockerInfo = await runCmd('docker ps --format "{{.Names}}: {{.Status}}"');
  if (dockerInfo.success && dockerInfo.stdout) {
    const output = dockerInfo.stdout;
    if (output.includes('orderer.scatterid.com')) ordererUp = true;
    if (output.includes('peer0.issuer.scatterid.com')) issuerPeerUp = true;
    if (output.includes('peer0.verifier.scatterid.com')) verifierPeerUp = true;
  }

  res.json({
    services: {
      cryptoService: cryptoServiceUp ? 'RUNNING' : 'STOPPED',
      verificationApi: verificationApiUp ? 'RUNNING' : 'STOPPED'
    },
    blockchain: {
      orderer: ordererUp ? 'RUNNING' : 'OFFLINE',
      issuerPeer: issuerPeerUp ? 'RUNNING' : 'OFFLINE',
      verifierPeer: verifierPeerUp ? 'RUNNING' : 'OFFLINE'
    }
  });
});

// API: SQLite Credentials List
app.get('/api/credentials', (req, res) => {
  try {
    const db = new Database(dbPath, { fileMustExist: true });
    
    // Get credentials
    const credentials = db.prepare('SELECT * FROM credentials ORDER BY issued_at DESC').all();
    
    // Get shards for each
    const credentialsWithShards = credentials.map(cred => {
      const shards = db.prepare('SELECT share_index, share_hash FROM shard_references WHERE credential_id = ?').all(cred.id);
      return {
        ...cred,
        shards
      };
    });

    db.close();
    res.json({ success: true, credentials: credentialsWithShards });
  } catch (err) {
    res.json({ success: false, error: err.message, credentials: [] });
  }
});

// API: Run E2E Diagnostics (Smoke Test)
app.post('/api/diagnostics/run', async (req, res) => {
  const logs = [];
  const addLog = (step, detail, status = 'info') => {
    logs.push({ timestamp: new Date().toISOString(), step, detail, status });
  };

  try {
    addLog('Start', 'Initiating E2E Diagnostics Smoke Test', 'info');

    // 1. Verify Verification API is up
    const apiUp = await checkPort(3000, VERIFICATION_API_HOST) || await checkPort(3000, '127.0.0.1');
    if (!apiUp) {
      addLog('Verification API Check', 'Verification API is offline on port 3000', 'error');
      return res.json({ success: false, logs });
    }
    addLog('Verification API Check', 'Verification API is active on port 3000', 'success');

    // 2. Verify Crypto Service is up
    const cryptoUp = await checkPort(5001, CRYPTO_SERVICE_HOST) || await checkPort(5001, '127.0.0.1');
    if (!cryptoUp) {
      addLog('Crypto Service Check', 'Crypto Service is offline on port 5001', 'error');
      return res.json({ success: false, logs });
    }
    addLog('Crypto Service Check', 'Crypto Service is active on port 5001', 'success');

    // 3. Trigger /issue
    addLog('Credential Issuance', `Sending POST request to ${VERIFICATION_API_URL}/issue`, 'info');
    const claim = {
      student: 'Diagnostic Test User',
      degree: 'Master of Science in Cybersecurity',
      timestamp: new Date().toISOString()
    };

    const issueResponse = await fetch(`${VERIFICATION_API_URL}/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim })
    });

    if (!issueResponse.ok) {
      const errText = await issueResponse.text();
      addLog('Credential Issuance', `API rejected issuance request: ${errText}`, 'error');
      return res.json({ success: false, logs });
    }

    const issueResult = await issueResponse.json();
    addLog('Credential Issuance', `Successfully issued. Credential ID: ${issueResult.credentialId}. TxID: ${issueResult.anchorTxId || 'Pending'}`, 'success');

    const credId = issueResult.credentialId;

    // 4. Trigger /verify
    addLog('Credential Verification', `Sending POST request to ${VERIFICATION_API_URL}/verify for ${credId}`, 'info');
    const verifyResponse = await fetch(`${VERIFICATION_API_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId: credId })
    });

    if (!verifyResponse.ok) {
      const errText = await verifyResponse.text();
      addLog('Credential Verification', `API rejected verification request: ${errText}`, 'error');
      return res.json({ success: false, logs });
    }

    const verifyResult = await verifyResponse.json();
    if (verifyResult.valid) {
      addLog('Credential Verification', `Verification SUCCEEDED. Anchor Status: ${verifyResult.anchorStatus}`, 'success');
    } else {
      addLog('Credential Verification', `Verification FAILED. Reason: ${verifyResult.reason || 'Unknown'}`, 'error');
    }

    res.json({ success: true, logs });
  } catch (err) {
    addLog('Exception', `Unexpected error during smoke test: ${err.message}`, 'error');
    res.json({ success: false, logs });
  }
});

// API: Get Progress and Docs
app.get('/api/progress', async (req, res) => {
  try {
    const progressPath = path.resolve(__dirname, '../../Progress.md');
    const content = await fs.readFile(progressPath, 'utf8');
    res.json({ success: true, content });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// API: Docker Logs
app.get('/api/logs/:container', async (req, res) => {
  const container = req.params.container;
  const validContainers = ['orderer.scatterid.com', 'peer0.issuer.scatterid.com', 'peer0.verifier.scatterid.com'];
  if (!validContainers.includes(container)) {
    return res.status(400).json({ success: false, error: 'Invalid container name' });
  }

  const logs = await runCmd(`docker logs --tail 100 ${container}`);
  res.json({
    success: logs.success,
    content: logs.success ? logs.stdout : logs.stderr
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ScatterID Project Dashboard running at http://0.0.0.0:${PORT}`);
});
