// ============================================
// NASDAQ Analysis AI — Core Application Logic
// Phase 1: Multi-Ticker Historical + Financials
// ============================================

const DEFAULT_CONFIG = {
    apiBaseUrl: 'https://nasdaq-historical-api.vercel.app',
    batchSize: 20,
    maxTickers: 500,
    retryAttempts: 3,
    retryDelayMs: 1000
};

let appConfig = { ...DEFAULT_CONFIG };
let financialCache = null;
let historicalCache = null;

function loadConfig() {
    const apiEl   = document.getElementById('apiBaseUrl');
    const batchEl = document.getElementById('batchSize');
    const maxEl   = document.getElementById('maxTickers');

    if (apiEl)   appConfig.apiBaseUrl = (apiEl.value || '').trim() || DEFAULT_CONFIG.apiBaseUrl;
    if (batchEl) appConfig.batchSize  = parseInt(batchEl.value, 10) || DEFAULT_CONFIG.batchSize;
    if (maxEl)   appConfig.maxTickers = parseInt(maxEl.value, 10)   || DEFAULT_CONFIG.maxTickers;
}

function parseTickers(raw) {
    if (!raw) return [];
    return raw
        .split(/[\s,;]+/)
        .map(s => s.trim().toUpperCase())
        .filter(s => /^[A-Z]{1,5}$/.test(s));
}

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
    row.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    box.appendChild(row);
}

function clearErrors(tab) {
    const box = document.getElementById(tab + 'Errors');
    if (box) { box.innerHTML = ''; box.classList.add('hidden'); }
}

function setRecordCount(tab, n) {
    const el = document.getElementById(tab + 'Count');
    if (el) el.textContent = n.toLocaleString() + ' record' + (n !== 1 ? 's' : '');
}

function formatFinancialNumber(num) {
    if (num === 0) return '$0';
    const abs = Math.abs(num);
    if (abs < 10 && !Number.isInteger(num)) return num.toFixed(2);
    if (abs >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return '$' + (num / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return '$' + (num / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    return '$' + num.toLocaleString('en-US');
}

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

    const cols = Object.keys(rows[0]);
    const thead = document.createElement('thead');
    const thr = document.createElement('tr');
    cols.forEach(function(c) {
        const th = document.createElement('th');
        th.textContent = c;
        th.className = 'sortable';
        th.onclick = function() { sortTable(tableId, c); };
        thr.appendChild(th);
    });
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(function(r) {
        const tr = document.createElement('tr');
        cols.forEach(function(c) {
            const td = document.createElement('td');
            let v = r[c];
            if (v !== '' && v !== null && v !== undefined) {
                const num = parseFloat(v);
                if (!isNaN(num) && c !== 'Metric' && c !== 'Symbol' && c !== 'Date') {
                    td.textContent = formatFinancialNumber(num);
                    td.className = 'numeric';
                } else {
                    td.textContent = v;
                }
            } else {
                td.textContent = '--';
                td.style.color = 'var(--text-muted)';
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    box.innerHTML = '';
    box.appendChild(table);
    setRecordCount(containerId.replace('Result', ''), rows.length);
}

const sortMemory = {};
function sortTable(tableId, col) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const headers = Array.from(table.querySelectorAll('thead th'));
    const hIndex = headers.findIndex(function(th) { return th.textContent === col; });
    if (hIndex === -1) return;

    const dir = sortMemory[tableId + col] === 'asc' ? 'desc' : 'asc';
    sortMemory[tableId + col] = dir;

    headers.forEach(function(th) { th.classList.remove('sort-asc', 'sort-desc'); });
    headers[hIndex].classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');

    rows.sort(function(a, b) {
        const av = a.children[hIndex].textContent.replace(/[$,BTM%]/g, '');
        const bv = b.children[hIndex].textContent.replace(/[$,BTM%]/g, '');
        const an = parseFloat(av);
        const bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn) && av !== '' && bv !== '') {
            return dir === 'asc' ? an - bn : bn - an;
        }
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    rows.forEach(function(r) { tbody.appendChild(r); });
}

function appFilterTable(tableId, query) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const q = query.toLowerCase();
    table.querySelectorAll('tbody tr').forEach(function(row) {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

async function fetchWithRetry(url, opts, attempt) {
    attempt = attempt || 1;
    try {
        const res = await fetch(url, opts || {});
        if (!res.ok && res.status >= 500 && attempt < appConfig.retryAttempts) {
            throw new Error('Server ' + res.status);
        }
        return res;
    } catch (err) {
        if (attempt < appConfig.retryAttempts) {
            const wait = appConfig.retryDelayMs * attempt;
            await new Promise(function(r) { setTimeout(r, wait); });
            return fetchWithRetry(url, opts, attempt + 1);
        }
        throw err;
    }
}

async function downloadHistory() {
    loadConfig();
    clearErrors('historical');

    const raw = document.getElementById('symbols') ? document.getElementById('symbols').value : '';
    const tickers = parseTickers(raw);

    if (!tickers.length) { alert('Enter at least one valid ticker.'); return; }
    if (tickers.length > appConfig.maxTickers) {
        alert('Limit is ' + appConfig.maxTickers + ' tickers. You entered ' + tickers.length + '.'); return;
    }

    const from = document.getElementById('fromDate') ? document.getElementById('fromDate').value : '';
    const to = document.getElementById('toDate') ? document.getElementById('toDate').value : '';

    setProgressVisible('historical', true);
    updateProgress('historical', 5, 'Preparing ' + tickers.length + ' ticker(s)...');

    try {
        const url = new URL(appConfig.apiBaseUrl + '/api/historical');
        url.searchParams.set('tickers', tickers.join(','));
        if (from) url.searchParams.set('from', from);
        if (to) url.searchParams.set('to', to);

        updateProgress('historical', 25, 'Calling NASDAQ API...');
        const res = await fetchWithRetry(url.toString());

        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);

        updateProgress('historical', 70, 'Parsing response...');
        const payload = await res.json();

        let data = payload.data || payload.historical || payload;
        if (!Array.isArray(data)) data = [];

        if (payload.errors && payload.errors.length) {
            payload.errors.forEach(function(e) { logError('historical', e); });
        }

        historicalCache = data;
        updateProgress('historical', 90, 'Rendering...');
        renderTable('historicalResult', data, 'historicalTable');
        updateProgress('historical', 100, 'Done. ' + data.length + ' rows.');

    } catch (err) {
        logError('historical', err.message);
        updateProgress('historical', 0, 'Failed.');
    } finally {
        setTimeout(function() { setProgressVisible('historical', false); }, 2500);
    }
}

async function loadFinancials() {
    loadConfig();
    clearErrors('financials');

    const raw = document.getElementById('financialSymbols') ? document.getElementById('financialSymbols').value : '';
    const tickers = parseTickers(raw);

    if (!tickers.length) { alert('Enter at least one valid ticker.'); return; }

    setProgressVisible('financials', true);
    updateProgress('financials', 5, 'Loading SEC data for ' + tickers.length + ' ticker(s)...');

    try {
        const url = new URL(appConfig.apiBaseUrl + '/api/financials');
        url.searchParams.set('tickers', tickers.join(','));

        updateProgress('financials', 30, 'Fetching SEC Company Facts...');
        const res = await fetchWithRetry(url.toString());

        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);

        updateProgress('financials', 70, 'Normalising statements...');
        const payload = await res.json();

        if (payload.errors && payload.errors.length) {
            payload.errors.forEach(function(e) { logError('financials', e); });
        }

        financialCache = payload;
        window.selectedPeriod = window.selectedPeriod || 'annual';
        window.selectedType = window.selectedType || 'income';

        const ctrl = document.getElementById('financialControls');
        if (ctrl) ctrl.classList.remove('hidden');

        showFinancialData(window.selectedType);

        updateProgress('financials', 100, 'Financial data loaded.');

    } catch (err) {
        logError('financials', err.message);
        updateProgress('financials', 0, 'Failed.');
    } finally {
        setTimeout(function() { setProgressVisible('financials', false); }, 2500);
    }
}

function loadFinancialPeriod(period) {
    window.selectedPeriod = period;
    if (financialCache) showFinancialData(window.selectedType || 'income');
}

function showFinancialData(type) {
    window.selectedType = type;
    if (!financialCache) return;

    const period = window.selectedPeriod || 'annual';
    let merged = [];

    const tickers = Object.keys(financialCache).filter(function(k) {
        return k !== 'errors' && k !== 'metadata';
    });

    tickers.forEach(function(sym) {
        const company = financialCache[sym];
        if (!company) return;
        const stmt = company[period] ? company[period][type] : null;
        if (!Array.isArray(stmt)) return;

        stmt.forEach(function(row) {
            if (!row.Symbol && !row.symbol) row.Symbol = sym;
        });
        merged = merged.concat(stmt);
    });

    renderTable('financialResult', merged, 'financialTable');
}

function saveSettings() {
    loadConfig();
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

function exportExcel(source) {
    const tableId = source === 'historical' ? 'historicalTable' : 'financialTable';
    const data = extractTableData(tableId);

    if (typeof generateExcel === 'function') {
        generateExcel(data, source);
    } else {
        downloadCSV(data, 'NASDAQ_' + source + '_' + new Date().toISOString().slice(0,10) + '.csv');
    }
}

function extractTableData(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll('thead th')).map(function(th) { return th.textContent; });
    return Array.from(table.querySelectorAll('tbody tr')).map(function(tr) {
        const obj = {};
        Array.from(tr.children).forEach(function(td, i) {
            obj[headers[i]] = td.textContent;
        });
        return obj;
    });
}

function downloadCSV(rows, filename) {
    if (!rows.length) { alert('No data to export.'); return; }
    const cols = Object.keys(rows[0]);
    const csv = [
        cols.join(','),
        rows.map(function(r) {
            return cols.map(function(c) {
                return '"' + String(r[c] || '').replace(/"/g, '""') + '"';
            }).join(',');
        }).join('\n')
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.selectedPeriod = 'annual';
window.selectedType = 'income';
