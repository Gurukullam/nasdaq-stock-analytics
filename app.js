// app.js — NASDAQ Analysis AI Frontend
// Complete Financial Statements tab with all 4 statement types

const API_BASE = localStorage.getItem('apiBase') || 'https://nasdaq-historical-api.vercel.app';
const DEFAULT_BATCH = parseInt(localStorage.getItem('batchSize')) || 5;
const DEFAULT_MAX_TICKERS = parseInt(localStorage.getItem('maxTickers')) || 20;

// ─── State ───
let currentTab = 'historical';
let financialState = {
  statement: 'income',   // income | balance | cashflow | ratios
  period: 'annual',      // annual | quarterly
  data: [],
  loading: false,
};
let historicalData = [];

// ─── Utils ───
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function parseTickers(input) {
  return input.toUpperCase().split(/[,;\s\n]+/).map(s => s.trim()).filter(Boolean);
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ─── Tab Switching ───
function switchTab(tab) {
  currentTab = tab;
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
}

// ─── Historical Data ───
async function loadHistoricalData() {
  const input = $('#historical-tickers').value;
  const tickers = parseTickers(input);
  if (tickers.length === 0) { showToast('Enter at least one ticker', 'error'); return; }
  if (tickers.length > DEFAULT_MAX_TICKERS) { showToast(`Max ${DEFAULT_MAX_TICKERS} tickers`, 'error'); return; }

  const startDate = $('#start-date').value;
  const endDate = $('#end-date').value;
  if (!startDate || !endDate) { showToast('Select date range', 'error'); return; }

  $('#historical-loading').style.display = 'block';
  $('#historical-results').innerHTML = '';

  try {
    const res = await fetch(`${API_BASE}/api/historical?ticker=${tickers.join(',')}&start=${startDate}&end=${endDate}`);
    const json = await res.json();
    historicalData = json.data || [];
    renderHistoricalTable(historicalData);
    showToast(`Loaded ${json.count} ticker(s)`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    $('#historical-loading').style.display = 'none';
  }
}

function renderHistoricalTable(data) {
  if (!data || data.length === 0) {
    $('#historical-results').innerHTML = '<p class="no-data">No data found.</p>';
    return;
  }
  const allRecords = [];
  data.forEach(d => {
    (d.records || []).forEach(r => {
      allRecords.push({ ...r, ticker: d.ticker });
    });
  });

  const html = `
    <div class="table-wrap">
      <table class="data-table" id="historical-table">
        <thead>
          <tr><th>Ticker</th><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr>
        </thead>
        <tbody>
          ${allRecords.map(r => `
            <tr>
              <td>${r.ticker}</td>
              <td>${r.date}</td>
              <td>${r.open?.toFixed(2) || '—'}</td>
              <td>${r.high?.toFixed(2) || '—'}</td>
              <td>${r.low?.toFixed(2) || '—'}</td>
              <td>${r.close?.toFixed(2) || '—'}</td>
              <td>${r.volume?.toLocaleString() || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <p class="record-count">${allRecords.length} records</p>
  `;
  $('#historical-results').innerHTML = html;
}

// ─── Financial Statements ───
function setFinancialStatement(type) {
  financialState.statement = type;
  $$('.stmt-btn').forEach(b => b.classList.toggle('active', b.dataset.stmt === type));
}

function setFinancialPeriod(period) {
  financialState.period = period;
  $$('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period));
}

async function loadFinancialData() {
  const input = $('#financial-tickers').value;
  const tickers = parseTickers(input);
  if (tickers.length === 0) { showToast('Enter at least one ticker', 'error'); return; }
  if (tickers.length > DEFAULT_MAX_TICKERS) { showToast(`Max ${DEFAULT_MAX_TICKERS} tickers`, 'error'); return; }

  $('#financial-loading').style.display = 'block';
  $('#financial-results').innerHTML = '';
  financialState.data = [];

  try {
    const res = await fetch(
      `${API_BASE}/api/financials?ticker=${tickers.join(',')}&statement=${financialState.statement}&period=${financialState.period}`
    );
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Unknown error');

    financialState.data = json.data || [];
    renderFinancialTables(financialState.data);

    if (json.errors?.length) {
      json.errors.forEach(e => showToast(`${e.ticker}: ${e.error}`, 'error'));
    }
    showToast(`Loaded ${json.count} ticker(s)`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    $('#financial-loading').style.display = 'none';
  }
}

function renderFinancialTables(data) {
  if (!data || data.length === 0) {
    $('#financial-results').innerHTML = '<p class="no-data">No data found.</p>';
    return;
  }

  const container = document.createElement('div');
  container.className = 'financial-container';

  data.forEach(item => {
    const periods = item.periods || [];
    const rows = item.rows || [];

    const wrapper = document.createElement('div');
    wrapper.className = 'financial-ticker-block';

    const title = document.createElement('h3');
    title.textContent = `${item.ticker} — ${item.statement.toUpperCase()} (${item.period})`;
    wrapper.appendChild(title);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrap';

    const table = document.createElement('table');
    table.className = 'data-table financial-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `<th>Metric</th>` + periods.map(p => `<th>${formatPeriod(p)}</th>`).join('');
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      const metricCell = document.createElement('td');
      metricCell.className = 'metric-name';
      metricCell.textContent = row.metric;
      tr.appendChild(metricCell);

      periods.forEach(p => {
        const cell = document.createElement('td');
        const val = row.values?.[p];
        cell.textContent = val?.display || '—';
        if (val?.raw !== null && val.raw < 0) cell.classList.add('negative');
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrapper.appendChild(tableWrap);
    container.appendChild(wrapper);
  });

  $('#financial-results').innerHTML = '';
  $('#financial-results').appendChild(container);
}

function formatPeriod(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function filterFinancials() {
  const term = $('#financial-filter').value.toLowerCase();
  $$('.financial-ticker-block').forEach(block => {
    const rows = block.querySelectorAll('tbody tr');
    let hasVisible = false;
    rows.forEach(row => {
      const metric = row.querySelector('.metric-name')?.textContent.toLowerCase() || '';
      const visible = metric.includes(term);
      row.style.display = visible ? '' : 'none';
      if (visible) hasVisible = true;
    });
    block.style.display = hasVisible ? '' : 'none';
  });
}

// ─── Excel Export ───
async function exportExcel() {
  if (currentTab === 'historical' && historicalData.length === 0) {
    showToast('No historical data to export', 'error'); return;
  }
  if (currentTab === 'financial' && financialState.data.length === 0) {
    showToast('No financial data to export', 'error'); return;
  }

  const wb = { SheetNames: [], Sheets: {} };

  if (currentTab === 'historical') {
    const allRecords = [];
    historicalData.forEach(d => {
      (d.records || []).forEach(r => allRecords.push({ Ticker: d.ticker, Date: r.date, Open: r.open, High: r.high, Low: r.low, Close: r.close, Volume: r.volume }));
    });
    const ws = XLSX.utils.json_to_sheet(allRecords);
    wb.SheetNames.push('Historical');
    wb.Sheets['Historical'] = ws;
  }

  if (currentTab === 'financial') {
    financialState.data.forEach(item => {
      const periods = item.periods || [];
      const rows = item.rows || [];
      const sheetData = rows.map(r => {
        const obj = { Metric: r.metric };
        periods.forEach(p => { obj[formatPeriod(p)] = r.values?.[p]?.raw; });
        return obj;
      });
      const name = `${item.ticker}_${item.statement}`.substring(0, 31);
      const ws = XLSX.utils.json_to_sheet(sheetData);
      wb.SheetNames.push(name);
      wb.Sheets[name] = ws;
    });
  }

  XLSX.writeFile(wb, `NASDAQ_Analysis_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Excel exported!', 'success');
}

// ─── Settings ───
function saveSettings() {
  const apiBase = $('#settings-api').value.trim();
  const batch = parseInt($('#settings-batch').value) || 5;
  const maxTickers = parseInt($('#settings-max').value) || 20;
  if (apiBase) localStorage.setItem('apiBase', apiBase);
  localStorage.setItem('batchSize', String(batch));
  localStorage.setItem('maxTickers', String(maxTickers));
  showToast('Settings saved', 'success');
}

function loadSettings() {
  $('#settings-api').value = localStorage.getItem('apiBase') || API_BASE;
  $('#settings-batch').value = localStorage.getItem('batchSize') || '5';
  $('#settings-max').value = localStorage.getItem('maxTickers') || '20';
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  // Tab buttons
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Statement type buttons
  $$('.stmt-btn').forEach(btn => {
    btn.addEventListener('click', () => setFinancialStatement(btn.dataset.stmt));
  });

  // Period buttons
  $$('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => setFinancialPeriod(btn.dataset.period));
  });

  // Load buttons
  $('#btn-load-historical')?.addEventListener('click', loadHistoricalData);
  $('#btn-load-financial')?.addEventListener('click', loadFinancialData);

  // Export
  $('#btn-export')?.addEventListener('click', exportExcel);

  // Filter
  $('#financial-filter')?.addEventListener('input', filterFinancials);

  // Settings
  $('#btn-save-settings')?.addEventListener('click', saveSettings);
  loadSettings();

  // Set defaults
  setFinancialStatement('income');
  setFinancialPeriod('annual');
});
