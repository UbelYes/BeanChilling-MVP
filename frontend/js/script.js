// ─── State ─────────────────────────────────────────────
const STORAGE_KEYS = {
  settings: 'coffea_settings',
  history: 'coffea_history'
};

let currentImageBlob = null;
let currentImageDataUrl = null;
let currentResult = null;

// ─── Settings ──────────────────────────────────────────
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) { return {}; }
}

function saveSettings() {
  const s = {
    endpointUrl: document.getElementById('endpointUrl').value.trim(),
    predictionKey: document.getElementById('predictionKey').value.trim(),
    modelName: document.getElementById('modelName').value.trim(),
    modelAccuracy: document.getElementById('modelAccuracy').value.trim()
  };
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(s));
  showSettingsStatus('Settings saved.', 'info');
}

function applySettingsToUI() {
  const s = loadSettings();
  document.getElementById('endpointUrl').value = s.endpointUrl || '';
  document.getElementById('predictionKey').value = s.predictionKey || '';
  document.getElementById('modelName').value = s.modelName || '';
  document.getElementById('modelAccuracy').value = s.modelAccuracy || '';
}

function showSettingsStatus(msg, kind) {
  const el = document.getElementById('settingsStatus');
  el.innerHTML = `<div class="status ${kind}">${msg}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 4000);
}

document.getElementById('toggleSettings').addEventListener('click', () => {
  document.getElementById('settings').classList.toggle('open');
});
document.getElementById('saveSettings').addEventListener('click', saveSettings);

document.getElementById('testConnection').addEventListener('click', async () => {
  saveSettings();
  const s = loadSettings();
  if (!s.endpointUrl || !s.predictionKey) {
    showSettingsStatus('Please enter both URL and key.', 'error');
    return;
  }
  showSettingsStatus('Cloud Function URL and key saved. Run an analysis to verify.', 'info');
});

// ─── Image capture ─────────────────────────────────────
function handleFile(file) {
  if (!file) return;
  currentImageBlob = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageDataUrl = e.target.result;
    renderPreview(currentImageDataUrl);
    document.getElementById('analyzeBtn').disabled = false;
    document.getElementById('clearImageBtn').style.display = 'inline-flex';
    hideResults();
  };
  reader.readAsDataURL(file);
}

function renderPreview(dataUrl) {
  const area = document.getElementById('captureArea');
  area.classList.add('has-image');
  area.innerHTML = `
    <img src="${dataUrl}" alt="Captured cherry" />
    <div class="capture-buttons">
      <label class="btn btn-secondary" for="cameraInput">Retake</label>
      <label class="btn btn-secondary" for="uploadInput">Choose another</label>
    </div>
    <input type="file" id="cameraInput" accept="image/*" capture="environment" />
    <input type="file" id="uploadInput" accept="image/*" />
  `;
  bindFileInputs();
}

function bindFileInputs() {
  document.getElementById('cameraInput').addEventListener('change', (e) => handleFile(e.target.files[0]));
  document.getElementById('uploadInput').addEventListener('change', (e) => handleFile(e.target.files[0]));
}
bindFileInputs();

function resetCaptureArea() {
  const area = document.getElementById('captureArea');
  area.classList.remove('has-image');
  area.innerHTML = `
    <div class="capture-hint">No image selected</div>
    <div class="capture-buttons">
      <label class="btn btn-primary" for="cameraInput">Take photo</label>
      <label class="btn btn-secondary" for="uploadInput">Upload photo</label>
    </div>
    <input type="file" id="cameraInput" accept="image/*" capture="environment" />
    <input type="file" id="uploadInput" accept="image/*" />
  `;
  bindFileInputs();
}

document.getElementById('clearImageBtn').addEventListener('click', () => {
  currentImageBlob = null;
  currentImageDataUrl = null;
  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('clearImageBtn').style.display = 'none';
  document.getElementById('noteInput').value = '';
  hideResults();
  resetCaptureArea();
});

// ─── Analyze ───────────────────────────────────────────
document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const s = loadSettings();
  if (!s.endpointUrl || !s.predictionKey) {
    showAnalyzeStatus('Please configure your endpoint and key in Settings.', 'error');
    document.getElementById('settings').classList.add('open');
    return;
  }
  if (!currentImageBlob) return;

  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Analyzing…';
  showAnalyzeStatus('Sending image to model…', 'info');

  try {
    const headers = { 'Content-Type': 'application/octet-stream' };
    if (s.predictionKey) headers['X-Api-Key'] = s.predictionKey;

    const res = await fetch(s.endpointUrl, {
      method: 'POST',
      headers,
      body: currentImageBlob
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} — ${text || 'request failed'}`);
    }

    const data = await res.json();
    currentResult = data;
    displayResults(data, s);
    saveToHistory(data);
    clearAnalyzeStatus();
  } catch (err) {
    showAnalyzeStatus(`Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze';
  }
});

function showAnalyzeStatus(msg, kind) {
  document.getElementById('analyzeStatus').innerHTML = `<div class="status ${kind}">${msg}</div>`;
}
function clearAnalyzeStatus() {
  document.getElementById('analyzeStatus').innerHTML = '';
}

function displayResults(data, settings = loadSettings()) {
  const predictions = (data.predictions || []).slice().sort((a, b) => b.probability - a.probability);
  if (predictions.length === 0) {
    showAnalyzeStatus('Model returned no predictions.', 'error');
    return;
  }

  const top = predictions[0];
  document.getElementById('topPrediction').textContent = top.tagName;
  document.getElementById('topConfidence').textContent = (top.probability * 100).toFixed(1) + '%';

  const metaParts = [];
  if (settings.modelName) metaParts.push(settings.modelName);
  if (settings.modelAccuracy) metaParts.push('reported model accuracy: ' + settings.modelAccuracy);
  metaParts.push(new Date().toLocaleString());
  document.getElementById('resultMeta').textContent = metaParts.join(' · ');

  const list = document.getElementById('predictionsList');
  list.innerHTML = '';
  predictions.forEach(p => {
    const pct = (p.probability * 100).toFixed(1);
    const row = document.createElement('div');
    row.className = 'prediction-row';
    row.innerHTML = `
      <div class="name">${p.tagName}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="pct">${pct}%</div>
    `;
    list.appendChild(row);
  });

  document.getElementById('results').classList.add('visible');
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResults() {
  document.getElementById('results').classList.remove('visible');
}

// ─── Thumbnail ─────────────────────────────────────────
function makeThumbnail(dataUrl, maxSize = 120) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ─── History ───────────────────────────────────────────
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) { return []; }
}

function persistHistory(arr) {
  try {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(arr));
  } catch (e) {
    // Storage quota — drop oldest entries
    const trimmed = arr.slice(-50);
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(trimmed));
  }
}

async function saveToHistory(result) {
  const settings = loadSettings();
  const predictions = (result.predictions || []).slice().sort((a, b) => b.probability - a.probability);
  const top = predictions[0] || { tagName: 'unknown', probability: 0 };
  const note = document.getElementById('noteInput').value.trim();

  const thumb = await makeThumbnail(currentImageDataUrl, 120);

  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    timestamp: new Date().toISOString(),
    thumbnail: thumb,
    topTag: top.tagName,
    topConfidence: top.probability,
    allPredictions: predictions.map(p => ({ tag: p.tagName, prob: p.probability })),
    note: note,
    modelName: settings.modelName || '',
    modelAccuracy: settings.modelAccuracy || ''
  };

  const history = loadHistory();
  history.unshift(entry);
  persistHistory(history);
  renderHistory();
}

function renderHistory() {
  const history = loadHistory();
  const container = document.getElementById('historyContainer');
  document.getElementById('logMeta').textContent =
    history.length === 0 ? '0 entries' : `${history.length} ${history.length === 1 ? 'entry' : 'entries'}`;

  if (history.length === 0) {
    container.innerHTML = '<div class="history-empty">No observations recorded yet.</div>';
    return;
  }

  const rows = history.map(e => {
    const date = new Date(e.timestamp);
    const dateStr = date.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
    const pillClass = (e.topTag || '').toLowerCase().replace(/[^a-z]/g, '');
    return `
      <tr data-id="${e.id}">
        <td><img class="thumb" src="${e.thumbnail}" alt="" /></td>
        <td><span class="label-pill ${pillClass}">${e.topTag}</span></td>
        <td class="conf">${(e.topConfidence * 100).toFixed(1)}%</td>
        <td class="date">${dateStr}</td>
        <td class="note-cell" title="${e.note}">${e.note || '—'}</td>
        <td><button class="delete-btn" data-id="${e.id}" title="Delete">×</button></td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="history-table">
      <thead>
        <tr>
          <th></th>
          <th>Prediction</th>
          <th>Confidence</th>
          <th>Recorded</th>
          <th>Note</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const filtered = loadHistory().filter(e => e.id !== id);
      persistHistory(filtered);
      renderHistory();
    });
  });
}

document.getElementById('clearHistoryBtn').addEventListener('click', () => {
  if (loadHistory().length === 0) return;
  if (!confirm('Delete all observations? This cannot be undone.')) return;
  persistHistory([]);
  renderHistory();
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  const history = loadHistory();
  if (history.length === 0) {
    alert('No observations to export.');
    return;
  }
  const headers = ['timestamp', 'top_prediction', 'top_confidence_percent', 'all_predictions', 'note', 'model_name', 'reported_model_accuracy'];
  const rows = history.map(e => [
    e.timestamp,
    e.topTag,
    (e.topConfidence * 100).toFixed(2),
    e.allPredictions.map(p => `${p.tag}:${(p.prob * 100).toFixed(2)}%`).join('; '),
    e.note,
    e.modelName,
    e.modelAccuracy
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(cell => {
      const s = String(cell ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `coffea-observations-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ─── Init ──────────────────────────────────────────────
applySettingsToUI();
renderHistory();

if (!loadSettings().endpointUrl) {
  document.getElementById('settings').classList.add('open');
}
