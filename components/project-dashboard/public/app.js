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
    } else if (tabId === 'tab-progress') {
      loadProgressLog();
    }
  });
});

// Refresh Dashboard button
const refreshAllBtn = document.getElementById('refresh-all-btn');
refreshAllBtn.addEventListener('click', () => {
  fetchHealthStatus();
  const activeTab = document.querySelector('.nav-link.active').getAttribute('data-tab');
  if (activeTab === 'tab-db') {
    loadDatabaseExplorer();
  } else if (activeTab === 'tab-progress') {
    loadProgressLog();
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

refreshLogsBtn.addEventListener('click', async () => {
  const container = containerLogSelect.value;
  logOutput.textContent = `Fetching logs for ${container}...`;
  
  try {
    const res = await fetch(`/api/logs/${container}`);
    const data = await res.json();
    if (data.success) {
      logOutput.textContent = data.content || 'No logs available.';
    } else {
      logOutput.textContent = `Error: ${data.error}`;
    }
  } catch (err) {
    logOutput.textContent = `Failed to connect to dashboard API: ${err.message}`;
  }
});

// Load DB Explorer
async function loadDatabaseExplorer() {
  const tbody = document.getElementById('db-table-body');
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
        setTimeout(printNextLine, 600);
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

// Load Progress MD
async function loadProgressLog() {
  const reader = document.getElementById('progress-md-reader');
  reader.innerHTML = 'Loading Progress Log...';

  try {
    const res = await fetch('/api/progress');
    const data = await res.json();

    if (!data.success) {
      reader.innerHTML = `<span class="text-error">Error loading file: ${data.error}</span>`;
      return;
    }

    reader.innerHTML = parseMarkdown(data.content);
  } catch (err) {
    reader.innerHTML = `<span class="text-error">Connection error: ${err.message}</span>`;
  }
}

// Extremely simple Markdown to HTML parser
function parseMarkdown(md) {
  let html = md;
  
  // Replace headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Replace bold
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  
  // Replace backticks inline code
  html = html.replace(/`(.*?)`/gim, '<code>$1</code>');
  
  // Replace bullet points
  html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
  html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
  
  // Wrap list items
  // Since we did simple regex, this is a crude but effective styling for display
  return html.split('\n').join('<br>');
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  fetchHealthStatus();
  
  // Auto-refresh health every 15 seconds
  setInterval(fetchHealthStatus, 15000);

  // Initialize Mermaid
  mermaid.initialize({
    startOnLoad: true,
    theme: 'dark',
    securityLevel: 'loose'
  });
});
