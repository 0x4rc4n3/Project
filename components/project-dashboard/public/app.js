// Tab Navigation
const navLinks = document.querySelectorAll('.nav-link');
const tabPanes = document.querySelectorAll('.tab-pane');
const pageTitle = document.getElementById('page-title');

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    
    // Set active link
    navLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    
    // Show active tab
    const tabId = link.getAttribute('data-tab');
    tabPanes.forEach(pane => {
      pane.classList.remove('active');
      if (pane.id === tabId) {
        pane.classList.add('active');
      }
    });

    // Update Header Title
    pageTitle.textContent = link.textContent.trim().replace(/^[\p{Emoji}\s]+/u, '');
    
    // Tab Specific Actions
    if (tabId === 'tab-db') {
      loadDatabaseExplorer();
      initFaultSimulator();
    } else if (tabId === 'tab-logs') {
      fetchLogs();
    }
  });
});

// Initialize Fault Simulator Controls
function initFaultSimulator() {
  const container = document.getElementById('fault-simulator-grid');
  if (!container) return;

  container.querySelectorAll('.btn-stop-node').forEach(btn => {
    btn.onclick = async () => {
      const nodeName = btn.getAttribute('data-node');
      btn.disabled = true;
      btn.textContent = 'Stopping...';
      await toggleNodeState(nodeName, 'stop');
      btn.classList.add('hidden');
      const startBtn = container.querySelector(`.btn-start-node[data-node="${nodeName}"]`);
      if (startBtn) {
        startBtn.classList.remove('hidden');
        startBtn.disabled = false;
        startBtn.textContent = 'Restore Node';
      }
      loadShardMatrix();
    };
  });

  container.querySelectorAll('.btn-start-node').forEach(btn => {
    btn.onclick = async () => {
      const nodeName = btn.getAttribute('data-node');
      btn.disabled = true;
      btn.textContent = 'Starting...';
      await toggleNodeState(nodeName, 'start');
      btn.classList.add('hidden');
      const stopBtn = container.querySelector(`.btn-stop-node[data-node="${nodeName}"]`);
      if (stopBtn) {
        stopBtn.classList.remove('hidden');
        stopBtn.disabled = false;
        stopBtn.textContent = 'Take Offline';
      }
      loadShardMatrix();
    };
  });
}

async function toggleNodeState(nodeName, action) {
  const statusBar = document.getElementById('fault-simulation-status');
  try {
    const res = await fetch('/api/shards/toggle-container', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeName, action })
    });
    const data = await res.json();
    if (data.success) {
      statusBar.innerHTML = `<span class="text-green font-bold">${nodeName} ${action === 'stop' ? 'OFFLINE (SIMULATED COMPROMISE)' : 'RESTORED & ONLINE'}.</span> Verification API will automatically fall back to remaining healthy nodes.`;
    } else {
      statusBar.innerHTML = `<span class="text-red">Failed to ${action} ${nodeName}: ${data.error}</span>`;
    }
  } catch (err) {
    statusBar.innerHTML = `<span class="text-red">Error: ${err.message}</span>`;
  }
}

// Refresh Dashboard button
const refreshAllBtn = document.getElementById('refresh-all-btn');
refreshAllBtn.addEventListener('click', () => {
  fetchHealthStatus();
  const activeTab = document.querySelector('.nav-link.active').getAttribute('data-tab');
  if (activeTab === 'tab-db') {
    loadDatabaseExplorer();
  } else if (activeTab === 'tab-logs') {
    fetchLogs();
  }
});

// Fetch Health Status of Services
async function fetchHealthStatus() {
  const statusApi = document.getElementById('status-api');
  const statusCrypto = document.getElementById('status-crypto');
  const statusOrderer = document.getElementById('status-orderer');
  const statusIssuerPeer = document.getElementById('status-issuer-peer');
  const statusVerifierPeer = document.getElementById('status-verifier-peer');

  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    // Update API states
    updateBadge(statusApi, data.services.verificationApi);
    updateBadge(statusCrypto, data.services.cryptoService);

    // Update Blockchain states
    updateBadge(statusOrderer, data.blockchain.orderer);
    updateBadge(statusIssuerPeer, data.blockchain.issuerPeer);
    updateBadge(statusVerifierPeer, data.blockchain.verifierPeer);
  } catch (err) {
    console.error('Failed to fetch status:', err);
    updateBadge(statusApi, 'ERROR');
    updateBadge(statusCrypto, 'ERROR');
    updateBadge(statusOrderer, 'OFFLINE');
    updateBadge(statusIssuerPeer, 'OFFLINE');
    updateBadge(statusVerifierPeer, 'OFFLINE');
  }
}

function updateBadge(element, status) {
  if (!element) return;
  element.textContent = status;
  element.className = 'status-badge'; // Reset classes
  
  if (status === 'RUNNING' || status === 'active' || status === 'SUCCESS') {
    element.classList.add('running');
  } else if (status === 'STOPPED' || status === 'OFFLINE' || status === 'ERROR') {
    element.classList.add('stopped');
  } else {
    element.classList.add('checking');
  }
}

// Fetch Container Logs
const refreshLogsBtn = document.getElementById('refresh-logs-btn');
const containerLogSelect = document.getElementById('container-log-select');
const logOutput = document.getElementById('log-output');

if (refreshLogsBtn) {
  refreshLogsBtn.addEventListener('click', async () => {
    const container = containerLogSelect.value;
    logOutput.textContent = `Fetching live logs for ${container}...`;
    
    try {
      const res = await fetch(`/api/logs/${container}`);
      const data = await res.json();
      if (data.success && data.content) {
        logOutput.textContent = data.content;
      } else {
        logOutput.textContent = data.error || 'No log output available.';
      }
    } catch (err) {
      logOutput.textContent = `Failed to connect to dashboard API: ${err.message}`;
    }
  });
}

// Load 5-Node Shard Matrix & Integrity Inspector
async function loadShardMatrix() {
  const container = document.getElementById('shard-matrix-cards');
  if (!container) return;

  try {
    const res = await fetch('/api/shards/integrity');
    const data = await res.json();

    if (!data.success || !data.nodes) {
      container.innerHTML = `<div class="text-error p-3">Failed to query node shards: ${data.error || 'Unknown error'}</div>`;
      return;
    }

    container.innerHTML = '';
    data.nodes.forEach(node => {
      const card = document.createElement('div');
      card.className = `shard-node-card ${node.status.toLowerCase()}`;
      
      const kbSize = (node.sizeBytes / 1024).toFixed(1);
      const statusBadge = node.status === 'HEALTHY' 
        ? '<span class="badge green">HEALTHY</span>'
        : (node.status === 'OFFLINE' ? '<span class="badge red">OFFLINE</span>' : '<span class="badge yellow">CORRUPTED</span>');

      card.innerHTML = `
        <div class="shard-node-header">
          <span class="node-title">Node ${node.nodeId} (${node.dbName})</span>
          ${statusBadge}
        </div>
        <div class="shard-node-metrics">
          <div class="metric"><span class="label">Stored Shares:</span> <span class="val">${node.totalShares}</span></div>
          <div class="metric"><span class="label">DB Size:</span> <span class="val">${kbSize} KB</span></div>
          <div class="metric"><span class="label">SHA3 Integrity:</span> <span class="val ${node.integrityCheck === 'VALID' ? 'text-success' : 'text-error'}">${node.integrityCheck}</span></div>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<div class="text-error p-3">Error loading shard matrix: ${err.message}</div>`;
  }
}

// Load DB Explorer
async function loadDatabaseExplorer() {
  await loadShardMatrix();

  const tbody = document.getElementById('db-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading database records...</td></tr>';

  try {
    const res = await fetch('/api/credentials');
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-error">Failed to query database: ${data.error}</td></tr>`;
      return;
    }

    if (data.credentials.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No credentials found in database.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.credentials.forEach(row => {
      const tr = document.createElement('tr');
      
      const shortId = row.id.substring(0, 8) + '...';
      const shortHash = row.data_hash.substring(0, 16) + '...';
      const shortTx = row.anchor_tx_id ? row.anchor_tx_id.substring(0, 16) + '...' : 'None';
      
      const statusClass = row.status === 'anchored' ? 'running' : (row.status === 'failed' ? 'stopped' : 'checking');

      tr.innerHTML = `
        <td title="${row.id}" style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--accent-cyan);">${shortId}</td>
        <td title="${row.data_hash}" style="font-family: var(--font-mono); font-size: 0.8rem;">${shortHash}</td>
        <td>${row.algorithm}</td>
        <td title="${row.anchor_tx_id || 'Not anchored'}" style="font-family: var(--font-mono); font-size: 0.8rem;">${shortTx}</td>
        <td><span class="status-badge ${statusClass}">${row.status.toUpperCase()}</span></td>
        <td>${new Date(row.issued_at).toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-error">Failed to connect: ${err.message}</td></tr>`;
  }
}

// Run E2E Diagnostics Smoke Test
const runDiagnosticBtn = document.getElementById('run-diagnostic-btn');
const diagnosticsConsole = document.getElementById('diagnostics-console');

if (runDiagnosticBtn) {
  runDiagnosticBtn.addEventListener('click', async () => {
    diagnosticsConsole.innerHTML = '<div class="console-line info"><span class="console-line-content">Initializing test runner...</span></div>';
    runDiagnosticBtn.disabled = true;

    try {
      const res = await fetch('/api/diagnostics/run', { method: 'POST' });
      const data = await res.json();
      
      diagnosticsConsole.innerHTML = '';
      
      // Simulate terminal typing output
      let i = 0;
      function printNextLine() {
        if (i < data.logs.length) {
          const item = data.logs[i];
          const line = document.createElement('div');
          line.className = `console-line ${item.status}`;
          
          const timestamp = new Date(item.timestamp).toLocaleTimeString();
          line.innerHTML = `
            <span class="console-line-meta">[${timestamp}] ${item.step}</span>
            <span class="console-line-content">${item.detail}</span>
          `;
          diagnosticsConsole.appendChild(line);
          diagnosticsConsole.scrollTop = diagnosticsConsole.scrollHeight;
          
          i++;
          setTimeout(printNextLine, 400);
        } else {
          runDiagnosticBtn.disabled = false;
        }
      }
      
      printNextLine();
    } catch (err) {
      diagnosticsConsole.innerHTML += `<div class="console-line error"><span class="console-line-content">Test execution failed: ${err.message}</span></div>`;
      runDiagnosticBtn.disabled = false;
    }
  });
}

// Load Progress MD
async function loadProgressLog() {
  const reader = document.getElementById('progress-md-reader');
  if (!reader) return;
  reader.innerHTML = 'Loading Progress Log...';

  try {
    const res = await fetch('/api/progress');
    const data = await res.json();

    if (!data.success) {
      reader.innerHTML = `<span class="text-error">Error loading file: ${data.error}</span>`;
      return;
    }

    if (window.marked) {
      reader.innerHTML = window.marked.parse(data.content);
    } else {
      reader.innerHTML = parseMarkdownFallback(data.content);
    }
  } catch (err) {
    reader.innerHTML = `<span class="text-error">Connection error: ${err.message}</span>`;
  }
}

function parseMarkdownFallback(md) {
  let html = md;
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/`(.*?)`/gim, '<code>$1</code>');
  html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
  return html;
}

// Initial fetch on page load
fetchHealthStatus();
