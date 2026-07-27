// ============================================
// NASDAQ Analysis AI — Core Application Logic
// Phase 1: Multi-Ticker Historical + Financials
// ============================================

/* ------------------------------------------
   CONFIGURATION
   ------------------------------------------ */
const DEFAULT_CONFIG = {
    apiBaseUrl: 'https://nasdaq-historical-api.vercel.app',
    batchSize: 20,
    maxTickers: 500,
    retryAttempts: 3,
    retryDelayMs: 1000
};

let appConfig = { ...DEFAULT_CONFIG };
let financialCache = null;   // Holds last financials payload
let historicalCache = null;  // Holds last historical payload

/* ------------------------------------------
   CONFIG LOADER
   ------------------------------------------ */
function loadConfig() {
    const apiEl   = document.getElementById('apiBaseUrl');
    const batchEl = document.getElementById('batchSize');
    const maxEl   = document.getElementById('maxTickers');

    if (apiEl)   appConfig.apiBaseUrl = (apiEl.value || '').trim() || DEFAULT_CONFIG.apiBaseUrl;
    if (batchEl) appConfig.batchSize  = parseInt(batchEl.value, 10) || DEFAULT_CONFIG.batchSize;
    if (maxEl)   appConfig.maxTickers = parseInt(maxEl.value, 10)   || DEFAULT_CONFIG.maxTickers;
}

/* ------------------------------------------
   TICKER PARSER  (frontend mirror of parser.js)
   Accepts: comma, space, semicolon, newline
   ------------------------------------------ */
function parseTickers(raw) {
    if (!raw) return [];
    return raw
        .split(/[\s,;]+/)                 // split on whitespace , ; 
        .map(s => s.trim().toUpperCase())
        .filter(s => /^[A-Z]{1,5}$/.test(s));
}

/* ------------------------------------------
   UI HELPERS  (progress, errors, counters)
   ------------------------------------------ */
function setProgressVisible(tab, visible) {
    const el = document.getElementById(tab + 'Progress');
    if (el) el.classList.toggle('hidden', !visible);
}

function updateProgress(tab, pct, msg) {
    const bar = document.getElementById(tab + 'ProgressBar');
    const txt = document.getElementById(tab + 'Status');
    if (bar) bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
    if (txt) txt.textContent = msg;
}

function logError(tab, msg) {
    const box = document.getElementById(tab + 'Errors');
    if (!box) return;
    box.classList.remove('hidden');
    const row = document.createElement('div');
    row.className = 'error-item';
    row.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    box.appendChild(row);
}

function clearErrors(tab) {
    const box = document.getElementById(tab + 'Errors');
    if (box) { box.innerHTML = ''; box.classList.add('hidden'); }
}

function setRecordCount(tab, n) {
    const el = document.getElementById(tab + 'Count');
    if (el) el.textContent = `${n.toLocaleString()} record${n !== 1 ? 's' : ''}`;
}

/* ------------------------------------------
   TABLE RENDERER  (inline until table.js arrives)
   ------------------------------------------ */
function renderTable(containerId, rows, tableId) {
    const box = document.getElementById(containerId);
    if (!box) return;

    if (!Array.isArray(rows) || rows.length === 0) {
        box.innerHTML = '<div class="empty-state">No data returned.</div>';
        setRecordCount(containerId.replace('Result', ''), 0);
        return;
    }

    const table = document.createElement('table');
    table.id = tableId;

    // --- header ---
    const cols = Object.keys(rows[0]);
    const thead = document.createElement('thead');
    const thr = document.createElement('tr');
    cols.forEach(c => {
        const th = document.createElement('th');
        th.textContent = c;
        th.className = 'sortable';
        th.onclick = () => sortTable(tableId, c);
        thr.appendChild(th);
    });
    thead.appendChild(thr);
    table.appendChild(thead);

    // --- body ---
    const tbody = document.createElement('tbody');
    rows.forEach(r => {
        const tr = document.createElement('tr');
        cols.forEach(c => {
            const td = document.createElement('td');
            let v = r[c];
            if (v === null || v === undefined) v = '';
            td.textContent = v;
            if (typeof v === 'number') td.className = 'numeric';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    box.innerHTML = '';
    box.appendChild(table);
    setRecordCount(containerId.replace('Result', ''), rows.length);
}

/* ------------------------------------------
   TABLE SORTING
   ------------------------------------------ */
const sortMemory = {};
function sortTable(tableId, col) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const hIndex = Array.from(table.querySelectorAll('thead th'))
                        .findIndex(th => th.textContent === col);
    if (hIndex === -1) return;

    const dir = sortMemory[tableId + col] === 'asc' ? 'desc' : 'asc';
    sortMemory[tableId + col] = dir;

    // visual indicators
    table.querySelectorAll('thead th').forEach(th => th.classList.remove('sort-asc','sort-desc'));
    table.querySelectorAll('thead th')[hIndex].classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');

    rows.sort((a, b) => {
        const av = a.children[hIndex].textContent;
        const bv = b.children[hIndex].textContent;
        const an = parseFloat(av.replace(/[$,%]/g, ''));
        const bn = parseFloat(bv.replace(/[$,%]/g, ''));
        if (!isNaN(an) && !isNaN(bn) && av !== '' && bv !== '') {
            return dir === 'asc' ? an - bn : bn - an;
        }
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    rows.forEach(r => tbody.appendChild(r));
}

/* ------------------------------------------
   TABLE FILTER  (called by index.html oninput)
   ------------------------------------------ */
function appFilterTable(tableId, query) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const q = query.toLowerCase();
    table.querySelectorAll('tbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

/* ------------------------------------------
   NETWORK: fetch with exponential backoff
   ------------------------------------------ */
async function fetchWithRetry(url, opts = {}, attempt = 1) {
    try {
        const res = await fetch(url, opts);
        // retry only on 5xx or network errors, not 4xx
        if (!res.ok && res.status >= 500 && attempt < appConfig.retryAttempts) {
            throw new Error(`Server ${res.status}`);
        }
        return res;
    } catch (err) {
        if (attempt < appConfig.retryAttempts) {
            const wait = appConfig.retryDelayMs * attempt;
            await new Promise(r => setTimeout(r, wait));
            return fetchWithRetry(url, opts, attempt + 1);
        }
        throw err;
    }
}

/* ------------------------------------------
   HISTORICAL DATA FLOW
   ------------------------------------------ */
async function downloadHistory() {
    loadConfig();
    clearErrors('historical');

    const raw  = document.getElementById('symbols')?.value || '';
    const tickers = parseTickers(raw);

    if (!tickers.length) { alert('Enter at least one valid ticker.'); return; }
    if (tickers.length > appConfig.maxTickers) {
        alert(`Limit is ${appConfig.maxTickers} tickers. You entered ${tickers.length}.`); return;
    }

    const from = document.getElementById('fromDate')?.value;
    const to   = document.getElementById('toDate')?.value;

    setProgressVisible('historical', true);
    updateProgress('historical', 5, `Preparing ${tickers.length} ticker(s)…`);

    try {
        const url = new URL(`${appConfig.apiBaseUrl}/api/historical`);
        url.searchParams.set('tickers', tickers.join(','));
        if (from) url.searchParams.set('from', from);
        if (to)   url.searchParams.set('to', to);

        updateProgress('historical', 25, 'Calling NASDAQ API…');
        const res = await fetchWithRetry(url.toString());

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        updateProgress('historical', 70, 'Parsing response…');
        const payload = await res.json();

        // Normalise whatever shape the backend returns
        let data = payload.data ?? payload.historical ?? payload;
        if (!Array.isArray(data)) data = [];

        // Backend may return per-symbol errors
        if (payload.errors?.length) payload.errors.forEach(e => logError('historical', e));

        historicalCache = data;
        updateProgress('historical', 90, 'Rendering…');
        renderTable('historicalResult', data, 'historicalTable');
        updateProgress('historical', 100, `Done. ${data.length} rows.`);

    } catch (err) {
        logError('historical', err.message);
        updateProgress('historical', 0, 'Failed.');
    } finally {
        setTimeout(() => setProgressVisible('historical', false), 2500);
    }
}

/* ------------------------------------------
   FINANCIAL DATA FLOW
   ------------------------------------------ */
async function loadFinancials() {
    loadConfig();
    clearErrors('financials');

    const raw = document.getElementById('financialSymbols')?.value || '';
    const tickers = parseTickers(raw);

    if (!tickers.length) { alert('Enter at least one valid ticker.'); return; }

    setProgressVisible('financials', true);
    updateProgress('financials', 5, `Loading SEC data for ${tickers.length} ticker(s)…`);

    try {
        const url = new URL(`${appConfig.apiBaseUrl}/api/financials`);
        url.searchParams.set('tickers', tickers.join(','));

        updateProgress('financials', 30, 'Fetching SEC Company Facts…');
        const res = await fetchWithRetry(url.toString());

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        updateProgress('financials', 70, 'Normalising statements…');
        const payload = await res.json();

        if (payload.errors?.length) payload.errors.forEach(e => logError('financials', e));

        financialCache = payload;
        window.selectedPeriod = window.selectedPeriod || 'annual';
        window.selectedType   = window.selectedType   || 'income';

        // reveal controls
        const ctrl = document.getElementById('financialControls');
        if (ctrl) ctrl.classList.remove('hidden');

        // refresh view with current selection
        showFinancialData(window.selectedType);

        updateProgress('financials', 100, 'Financial data loaded.');

    } catch (err) {
        logError('financials', err.message);
        updateProgress('financials', 0, 'Failed.');
    } finally {
        setTimeout(() => setProgressVisible('financials', false), 2500);
    }
}

/* ------------------------------------------
   FINANCIAL VIEW SWITCHING
   (called by inline setPeriod / showFinancial)
   ------------------------------------------ */
function loadFinancialPeriod(period) {
    window.selectedPeriod = period;
    if (financialCache) showFinancialData(window.selectedType || 'income');
}

function showFinancialData(type) {
    window.selectedType = type;
    if (!financialCache) return;

    const period = window.selectedPeriod || 'annual';
    let merged = [];

    // Expected backend shape: { AAPL: { annual:{ income:[...], ... } }, errors:[] }
    const tickers = Object.keys(financialCache).filter(k => k !== 'errors' && k !== 'metadata');

    tickers.forEach(sym => {
        const company = financialCache[sym];
        if (!company) return;
        const stmt = company[period]?.[type];
        if (!Array.isArray(stmt)) return;

        stmt.forEach(row => {
            // Guarantee Symbol column exists for pivoting / filtering
            if (!row.Symbol && !row.symbol) row.Symbol = sym;
        });
        merged = merged.concat(stmt);
    });

    renderTable('financialResult', merged, 'financialTable');
}

/* ------------------------------------------
   SETTINGS PERSISTENCE
   ------------------------------------------ */
function saveSettings() {
    loadConfig();
    // In Phase 3 this will POST to Supabase; for now keep in memory
    alert('Settings saved for this session.');
}

function resetSettings() {
    const apiEl   = document.getElementById('apiBaseUrl');
    const batchEl = document.getElementById('batchSize');
    const maxEl   = document.getElementById('maxTickers');

    if (apiEl)   apiEl.value   = DEFAULT_CONFIG.apiBaseUrl;
    if (batchEl) batchEl.value = DEFAULT_CONFIG.batchSize;
    if (maxEl)   maxEl.value   = DEFAULT_CONFIG.maxTickers;

    appConfig = { ...DEFAULT_CONFIG };
}

/* ------------------------------------------
   EXCEL EXPORT BRIDGE
   (delegates to excel.js when present)
   ------------------------------------------ */
function exportExcel(source) {
    const tableId = source === 'historical' ? 'historicalTable' : 'financialTable';
    const data = extractTableData(tableId);

    if (typeof generateExcel === 'function') {
        generateExcel(data, source);   // excel.js hook
    } else {
        // Fallback: CSV download so the UI isn't dead
        downloadCSV(data, `NASDAQ_${source}_${new Date().toISOString().slice(0,10)}.csv`);
    }
}

function extractTableData(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent);
    return Array.from(table.querySelectorAll('tbody tr')).map(tr => {
        const obj = {};
        Array.from(tr.children).forEach((td, i) => { obj[headers[i]] = td.textContent; });
        return obj;
    });
}

// Minimal CSV fallback if excel.js isn't loaded yet
function downloadCSV(rows, filename) {
    if (!rows.length) { alert('No data to export.'); return; }
    const cols = Object.keys(rows[0]);
    const csv = [
        cols.join(','),
        ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}