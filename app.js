// app.js — NASDAQ Analysis AI Frontend
// v2: Buttons below ticker, Ticker column for multi-ticker, unified table

const API_BASE = localStorage.getItem('apiBase') || 'https://nasdaq-historical-api.vercel.app';
const DEFAULT_BATCH = parseInt(localStorage.getItem('batchSize')) || 5;
const DEFAULT_MAX_TICKERS = parseInt(localStorage.getItem('maxTickers')) || 20;

// ─── State ───
let currentTab = 'financial';
let financialState = {
  statement: 'income',
  period: 'annual',
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

// ─── Clear Functions ───
function clearHistorical() {
  $('#historical-tickers').value = '';
  $('#historical-results').innerHTML = '';
  historicalData = [];
}

function clearFinancial() {
  $('#financial-tickers').value = '';
  $('#financial-results').innerHTML = '';
  financialState.data = [];
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
              <td><span class="ticker-badge">${r.ticker}</span></td>
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

  const isMultiTicker = data.length > 1;
  const container = document.createElement('div');
  container.className = 'financial-container';

  if (isMultiTicker) {
    // Unified table with Ticker column for multi-ticker
    renderUnifiedFinancialTable(data, container);
  } else {
    // Single ticker — clean table without redundant ticker column
    renderSingleFinancialTable(data[0], container);
  }

  $('#financial-results').innerHTML = '';
  $('#financial-results').appendChild(container);
}

function renderSingleFinancialTable(item, container) {
  const periods = item.periods || [];
  const rows = item.rows || [];

  const wrapper = document.createElement('div');
  wrapper.className = 'financial-ticker-block';

  const title = document.createElement('h3');
  title.innerHTML = `<span class="ticker-badge">${item.ticker}</span> — ${capitalize(item.statement)} (${item.period})`;
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
}

function renderUnifiedFinancialTable(data, container) {
  // Collect all unique periods across all tickers
  const allPeriodsSet = new Set();
  data.forEach(item => {
    (item.periods || []).forEach(p => allPeriodsSet.add(p));
  });
  const allPeriods = Array.from(allPeriodsSet).sort().reverse();

  // Collect all unique metrics
  const allMetricsSet = new Set();
  data.forEach(item => {
    (item.rows || []).forEach(r => allMetricsSet.add(r.metric));
  });
  const allMetrics = Array.from(allMetricsSet);

  const wrapper = document.createElement('div');
  wrapper.className = 'financial-ticker-block';

  const title = document.createElement('h3');
  const tickers = data.map(d => `<span class="ticker-badge">${d.ticker}</span>`).join(' ');
  title.innerHTML = `${tickers} — ${capitalize(data[0].statement)} (${data[0].period})`;
  wrapper.appendChild(title);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';

  const table = document.createElement('table');
  table.className = 'data-table financial-table';

  // Header: Ticker | Metric | Period1 | Period2 | ...
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `<th class="col-ticker">Ticker</th><th class="col-metric">Metric</th>` +
    allPeriods.map(p => `<th>${formatPeriod(p)}</th>`).join('');
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body: group by metric, then by ticker
  const tbody = document.createElement('tbody');
  allMetrics.forEach(metric => {
    data.forEach(item => {
      const row = item.rows?.find(r => r.metric === metric);
      if (!row) return;

      const tr = document.createElement('tr');

      // Ticker cell
      const tickerCell = document.createElement('td');
      tickerCell.innerHTML = `<span class="ticker-badge">${item.ticker}</span>`;
      tickerCell.className = 'col-ticker';
      tr.appendChild(tickerCell);

      // Metric cell
      const metricCell = document.createElement('td');
      metricCell.className = 'metric-name col-metric';
      metricCell.textContent = metric;
      tr.appendChild(metricCell);

      // Period values
      allPeriods.forEach(p => {
        const cell = document.createElement('td');
        const val = row.values?.[p];
        cell.textContent = val?.display || '—';
        if (val?.raw !== null && val.raw < 0) cell.classList.add('negative');
        tr.appendChild(cell);
      });

      tbody.appendChild(tr);
    });
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  wrapper.appendChild(tableWrap);
  container.appendChild(wrapper);
}

function formatPeriod(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function capitalize(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function filterFinancials() {
  const term = $('#financial-filter').value.toLowerCase();
  $$('.financial-table tbody tr').forEach(row => {
    const ticker = row.querySelector('.col-ticker')?.textContent.toLowerCase() || '';
    const metric = row.querySelector('.metric-name')?.textContent.toLowerCase() || '';
    const visible = ticker.includes(term) || metric.includes(term);
    row.style.display = visible ? '' : 'none';
  });
}

// ─── Excel Export ───
async function exportHistoricalExcel() {
  if (historicalData.length === 0) {
    showToast('No historical data to export', 'error'); return;
  }
  const allRecords = [];
  historicalData.forEach(d => {
    (d.records || []).forEach(r => allRecords.push({
      Ticker: d.ticker, Date: r.date, Open: r.open, High: r.high,
      Low: r.low, Close: r.close, Volume: r.volume
    }));
  });
  const ws = XLSX.utils.json_to_sheet(allRecords);
  const wb = { SheetNames: ['Historical'], Sheets: { Historical: ws } };
  XLSX.writeFile(wb, `NASDAQ_Historical_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Historical data exported!', 'success');
}

async function exportFinancialExcel() {
  if (financialState.data.length === 0) {
    showToast('No financial data to export', 'error'); return;
  }

  const wb = { SheetNames: [], Sheets: {} };

  financialState.data.forEach(item => {
    const periods = item.periods || [];
    const rows = item.rows || [];
    const sheetData = rows.map(r => {
      const obj = { Ticker: item.ticker, Metric: r.metric };
      periods.forEach(p => { obj[formatPeriod(p)] = r.values?.[p]?.raw; });
      return obj;
    });
    const name = `${item.ticker}_${item.statement}`.substring(0, 31);
    const ws = XLSX.utils.json_to_sheet(sheetData);
    wb.SheetNames.push(name);
    wb.Sheets[name] = ws;
  });

  XLSX.writeFile(wb, `NASDAQ_Financials_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Financial data exported!', 'success');
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

  // Export buttons
  $('#btn-export-historical')?.addEventListener('click', exportHistoricalExcel);
  $('#btn-export-financial')?.addEventListener('click', exportFinancialExcel);

  // Filter
  $('#financial-filter')?.addEventListener('input', filterFinancials);

  // Settings
  $('#btn-save-settings')?.addEventListener('click', saveSettings);
  loadSettings();

  // Set defaults
  setFinancialStatement('income');
  setFinancialPeriod('annual');
});
